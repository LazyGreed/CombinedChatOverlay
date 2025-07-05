
import type { ChatMessage, EmoteData } from '../types';
import { addMessage, addMessages, updateConnectionStatus } from '../stores/chatStore';

// Helper: fetch with timeout (for local API only)
async function fetchWithTimeout(resource: string, options: any = {}, timeout = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(resource, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
}


export class YouTubeService {
    // Dynamic mapping of YouTube emote shortcuts to image URLs
    private emoteMap: Record<string, string> = {};
    private channelName: string = '';
    private videoId: string = '';
    private pollInterval: number | null = null;
    private continuation: string = '';
    private pollingIntervalMs: number = 1000;
    private isActive: boolean = true;
    private apiCallCount: number = 0;
    private lastError: string = '';

    constructor(channelName: string) {
        this.channelName = channelName;
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
        }
    }

    async connect(): Promise<void> {
        try {
            // Step 1: Get videoId, initial continuation, and emoteMap from the backend API
            const res = await fetchWithTimeout('/api/youtube-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channelName: this.channelName })
            }, 10000);
            const result = await res.json();
            if (!res.ok || result.error) {
                throw new Error(result.error || 'Failed to get YouTube chat info');
            }
            this.videoId = result.videoId;
            this.continuation = result.continuation;
            this.emoteMap = result.emoteMap || {};
            updateConnectionStatus('youtube', true);
            this.startAdaptivePolling();
        } catch (error) {
            console.error('YouTube connection error:', error);
            updateConnectionStatus('youtube', false);
            this.lastError = error instanceof Error ? error.message : String(error);
            throw error;
        }
    }

    private handleVisibilityChange(): void {
        if (document.hidden) {
            this.isActive = false;
            this.adjustPollingInterval(10000);
        } else {
            this.isActive = true;
            this.adjustPollingInterval(this.pollingIntervalMs);
        }
    }

    private startAdaptivePolling(): void {
        this.pollingIntervalMs = 1000;
        this.pollMessages();
        this.scheduleNextPoll();
    }

    private scheduleNextPoll(): void {
        if (this.pollInterval) {
            clearTimeout(this.pollInterval);
        }
        this.pollInterval = window.setTimeout(() => {
            this.pollMessages();
        }, this.pollingIntervalMs);
    }

    private adjustPollingInterval(newInterval: number): void {
        this.pollingIntervalMs = newInterval;
        if (this.pollInterval) {
            clearTimeout(this.pollInterval);
            this.scheduleNextPoll();
        }
    }

    private async pollMessages(): Promise<void> {
        if (!this.continuation || !this.videoId) {
            updateConnectionStatus('youtube', false);
            this.lastError = 'Missing continuation or videoId.';
            return;
        }
        try {
            const res = await fetchWithTimeout('/api/youtube-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channelName: this.channelName, videoId: this.videoId, continuation: this.continuation })
            }, 10000);
            const result = await res.json();
            if (!res.ok || result.error) {
                console.warn('YouTube chat polling error:', result.error || 'Failed to fetch YouTube chat');
                updateConnectionStatus('youtube', false);
                this.lastError = result.error || 'Failed to fetch YouTube chat';
                this.adjustPollingInterval(10000);
                this.scheduleNextPoll();
                return;
            }
            // Use backend-minimized messages and continuation
            const messagesFromBackend = Array.isArray(result.messages) ? result.messages : [];
            if (result.continuation) {
                this.continuation = result.continuation;
            }
            // Update emoteMap if present in response
            if (result.emoteMap) {
                this.emoteMap = result.emoteMap;
            }
            // Merge new YouTube messages into the store, deduplicate by id, keep most recent 100
            // Convert timestamps for new YouTube messages
            const newYouTubeMsgs = messagesFromBackend.map((msg: any) => ({
                ...msg,
                timestamp: new Date(msg.timestamp),
            }));
            // Use the store's addMessages to handle deduplication and limiting
            addMessages(newYouTubeMsgs);
            // Use a fixed polling interval (YouTube's suggestion not available)
            this.adjustPollingInterval(1000);
            updateConnectionStatus('youtube', true);
        } catch (err) {
            console.error('YouTube chat polling error:', err);
            updateConnectionStatus('youtube', false);
            this.lastError = err instanceof Error ? err.message : String(err);
            this.adjustPollingInterval(10000);
        }
        this.scheduleNextPoll();
    }


    // Parse YouTube chat item from scraping endpoint
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
            emotes.push({
                name: emoteShortcut,
                url,
                positions: [[match.index, match.index + match[0].length - 1]],
                platform: 'youtube',
            });
        }

        // 2. Unicode emoji detection (preserve existing logic)
        const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
        while ((match = emojiRegex.exec(message)) !== null) {
            emotes.push({
                name: match[0],
                url: '',
                positions: [[match.index, match.index + match[0].length - 1]],
                platform: 'youtube',
            });
        }
        return emotes;
    }


    getApiUsageStats(): { totalCalls: number; currentInterval: number; lastError: string } {
        return {
            totalCalls: this.apiCallCount,
            currentInterval: this.pollingIntervalMs,
            lastError: this.lastError
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
        updateConnectionStatus('youtube', false);
    }
}