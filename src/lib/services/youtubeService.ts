
import type { ChatMessage, EmoteData } from '../types';
import { addMessage, addMessages, updateConnectionStatus } from '../stores/chatStore';

// Helper: fetch with timeout (for local API only)
async function fetchWithTimeout(resource: string, options: any = {}, timeout = 15000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(resource, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

export class YouTubeService {
    // Dynamic mapping of YouTube emote shortcuts to image URLs
    private emoteMap: Record<string, string> = {};
    private channelName: string = '';
    private videoId: string = '';
    private pollInterval: number | null = null;
    private continuation: string = '';
    private pollingIntervalMs: number = 100; // 100ms polling interval
    private isActive: boolean = true;
    private apiCallCount: number = 0;
    private lastError: string = '';
    private retryCount: number = 0;
    private maxRetries: number = 5;

    constructor(channelName: string) {
        this.channelName = channelName;
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
        }
    }

    async connect(): Promise<void> {
        this.retryCount = 0;
        this.lastError = '';
        
        try {
            console.log(`Connecting to YouTube chat for channel: ${this.channelName}`);
            
            // Step 1: Get videoId, initial continuation, and emoteMap from the backend API
            const res = await fetchWithTimeout('/api/youtube-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channelName: this.channelName })
            }, 15000);
            
            const result = await res.json();
            
            if (!res.ok || result.error) {
                // Provide more specific error messages
                const errorMessage = result.error || 'Failed to get YouTube chat info';
                console.error('YouTube API Error:', errorMessage);
                throw new Error(errorMessage);
            }
            
            this.videoId = result.videoId;
            this.continuation = result.continuation;
            this.emoteMap = result.emoteMap || {};
            
            console.log(`Successfully connected to YouTube chat. Video ID: ${this.videoId}`);
            
            // Validate that we have the required data
            if (!this.videoId || !this.continuation) {
                throw new Error('Invalid response from YouTube API: missing videoId or continuation');
            }
            
            updateConnectionStatus('youtube', true);
            this.startAdaptivePolling();
            
        } catch (error) {
            console.error('YouTube connection error:', error);
            updateConnectionStatus('youtube', false);
            this.lastError = error instanceof Error ? error.message : String(error);
            
            // Don't immediately retry for certain errors
            if (this.lastError.includes('No live') || this.lastError.includes('Could not find')) {
                console.log('Not retrying due to channel/stream availability issue');
                throw error;
            }
            
            throw error;
        }
    }

    private handleVisibilityChange(): void {
        if (document.hidden) {
            this.isActive = false;
            // No-op: polling interval removed
        } else {
            this.isActive = true;
            // No-op: polling interval removed
        }
    }

    private startAdaptivePolling(): void {
        this.pollMessages();
    }

    private scheduleNextPoll(): void {
        // Poll again after 100ms
        setTimeout(() => this.pollMessages(), this.pollingIntervalMs);
    }

    private adjustPollingInterval(newInterval: number): void {
        // No-op: polling interval removed
    }

    private async pollMessages(): Promise<void> {
        if (!this.continuation || !this.videoId) {
            updateConnectionStatus('youtube', false);
            this.lastError = 'Missing continuation or videoId.';
            console.warn('YouTube polling stopped: missing continuation or videoId');
            return;
        }

        try {
            this.apiCallCount++;

            const res = await fetchWithTimeout('/api/youtube-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channelName: this.channelName,
                    videoId: this.videoId,
                    continuation: this.continuation
                })
            }, 15000);

            const result = await res.json();

            if (!res.ok || result.error) {
                throw new Error(result.error || 'Failed to fetch YouTube chat');
            }

            // Use backend-minimized messages and continuation
            const messagesFromBackend = Array.isArray(result.messages) ? result.messages : [];

            if (result.continuation) {
                this.continuation = result.continuation;
            }

            // Update emoteMap if present in response
            if (result.emoteMap) {
                this.emoteMap = { ...this.emoteMap, ...result.emoteMap };
            }

            // Convert timestamps for new YouTube messages
            const newYouTubeMsgs = messagesFromBackend.map((msg: any) => ({
                ...msg,
                timestamp: new Date(msg.timestamp),
            }));

            // Add new messages to store
            if (newYouTubeMsgs.length > 0) {
                console.log(`Received ${newYouTubeMsgs.length} new YouTube messages`);
                addMessages(newYouTubeMsgs);
            }

            updateConnectionStatus('youtube', true);
            this.lastError = '';

        } catch (err) {
            console.error('YouTube chat polling error:', err);
            this.lastError = err instanceof Error ? err.message : String(err);
            this.retryCount++;

            if (this.retryCount >= this.maxRetries) {
                console.error('Max retries reached for YouTube chat. Stopping polling.');
                updateConnectionStatus('youtube', false);
                return;
            }

            updateConnectionStatus('youtube', false);
        }

        // Immediately poll again (no interval)
        this.scheduleNextPoll();
    }


    // Parse YouTube chat item (legacy method - kept for compatibility)
    private parseYouTubeChatItem(item: any): ChatMessage | null {
        // Only handle text messages for now
        if (!item.liveChatTextMessageRenderer) return null;
        
        const renderer = item.liveChatTextMessageRenderer;
        const messageParts = renderer.message?.runs || [];
        
        let message = '';
        for (const part of messageParts) {
            if (part.text) message += part.text;
            // Optionally handle emojis here
        }
        
        const emotes = this.extractYouTubeEmotes(message);
        
        return {
            id: `youtube-${renderer.id}`,
            platform: 'youtube',
            username: renderer.authorName?.simpleText || 'Unknown',
            message,
            timestamp: renderer.timestampUsec ? new Date(Number(renderer.timestampUsec) / 1000) : new Date(),
            emotes
        };
    }

    private extractYouTubeEmotes(message: string): EmoteData[] {
        const emotes: EmoteData[] = [];
        
        // 1. YouTube emote :emote_name: detection (use dynamic emoteMap)
        const emotePattern = /(:[a-zA-Z0-9_]+:)/g;
        let match;
        
        while ((match = emotePattern.exec(message)) !== null) {
            const emoteShortcut = match[1];
            const url = this.emoteMap[emoteShortcut] || '';
            
            if (url) {
                emotes.push({
                    name: emoteShortcut,
                    url,
                    positions: [[match.index, match.index + match[0].length - 1]],
                    platform: 'youtube',
                });
            }
        }

        // 2. Unicode emoji detection
        const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
        
        // Reset regex state
        emojiRegex.lastIndex = 0;
        
        while ((match = emojiRegex.exec(message)) !== null) {
            emotes.push({
                name: match[0],
                url: '', // No URL for Unicode emojis
                positions: [[match.index, match.index + match[0].length - 1]],
                platform: 'youtube',
            });
        }
        
        return emotes;
    }

    getApiUsageStats(): { 
        totalCalls: number; 
        currentInterval: number; 
        lastError: string; 
        retryCount: number;
        videoId: string;
        continuation: string;
    } {
        return {
            totalCalls: this.apiCallCount,
            currentInterval: 0, // Polling interval removed
            lastError: this.lastError,
            retryCount: this.retryCount,
            videoId: this.videoId,
            continuation: this.continuation ? 'Present' : 'Missing'
        };
    }

    disconnect(): void {
        if (this.pollInterval) {
            clearTimeout(this.pollInterval);
            this.pollInterval = null;
        }
        
        if (typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
        }
        
        // Clear cached data
        this.videoId = '';
        this.continuation = '';
        this.emoteMap = {};
        this.retryCount = 0;
        this.lastError = '';
        
        updateConnectionStatus('youtube', false);
        console.log('YouTube chat service disconnected');
    }
}