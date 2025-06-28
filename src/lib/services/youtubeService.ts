import type { ChatMessage, EmoteData } from '../types';
import { addMessage, updateConnectionStatus } from '../stores/chatStore';

export class YouTubeService {
    private channelName: string = '';
    private apiKey: string = '';
    private liveChatId: string = '';
    private pollInterval: number | null = null;
    private nextPageToken: string = '';
    private pollingIntervalMs: number = 5000; // Start with 5 seconds
    private lastMessageCount: number = 0;
    private consecutiveEmptyPolls: number = 0;
    private isActive: boolean = true;
    private apiCallCount: number = 0;
    private dailyQuotaLimit: number = 10000; // Conservative daily limit
    private hourlyQuotaUsed: number = 0;
    private lastHourReset: number = Date.now();

    constructor(channelName: string, apiKey: string) {
        this.channelName = channelName;
        this.apiKey = apiKey;

        // Listen for tab visibility changes to pause when not visible
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
        }
    }

    async connect(): Promise<void> {
        try {
            // First, get the channel ID from channel name
            const channelId = await this.getChannelId();

            // Then get the live video ID from the channel
            const videoId = await this.getLiveVideoId(channelId);

            // Finally get the live chat ID
            await this.getLiveChatId(videoId);

            updateConnectionStatus('youtube', true);

            // Start with adaptive polling
            this.startAdaptivePolling();
        } catch (error) {
            console.error('YouTube connection error:', error);
            updateConnectionStatus('youtube', false);
            throw error;
        }
    }

    private handleVisibilityChange(): void {
        if (document.hidden) {
            // Page is hidden, slow down polling significantly
            this.isActive = false;
            this.adjustPollingInterval(10000); // 10 seconds when hidden
        } else {
            // Page is visible, resume normal polling
            this.isActive = true;
            this.adjustPollingInterval(this.pollingIntervalMs);
        }
    }

    private checkQuotaLimits(): boolean {
        const now = Date.now();

        // Reset hourly counter if an hour has passed
        if (now - this.lastHourReset > 600000) { // 10 minutes
            this.hourlyQuotaUsed = 0;
            this.lastHourReset = now;
        }

        // Conservative limits: 100 API calls per hour
        if (this.hourlyQuotaUsed >= 100) {
            console.warn('YouTube API hourly quota approaching limit, slowing down...');
            this.adjustPollingInterval(60000); // 1 minute intervals
            return false;
        }

        return true;
    }

    private incrementApiCall(): void {
        this.apiCallCount++;
        this.hourlyQuotaUsed++;
    }

    private async getChannelId(): Promise<string> {
        this.incrementApiCall();

        // First try to get channel by username
        let response = await fetch(
            `https://www.googleapis.com/youtube/v3/channels?part=id&forUsername=${this.channelName}&key=${this.apiKey}`
        );

        let data = await response.json();

        // If no result, try with handle format (@username)
        if (!data.items || data.items.length === 0) {
            this.incrementApiCall();
            const handleName = this.channelName.startsWith('@') ? this.channelName.slice(1) : this.channelName;
            response = await fetch(
                `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${handleName}&key=${this.apiKey}`
            );
            data = await response.json();
        }

        // If still no result, try searching
        if (!data.items || data.items.length === 0) {
            this.incrementApiCall();
            response = await fetch(
                `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${this.channelName}&key=${this.apiKey}`
            );
            data = await response.json();

            if (data.items && data.items.length > 0) {
                return data.items[0].snippet.channelId;
            }
        }

        if (data.items && data.items.length > 0) {
            return data.items[0].id;
        }

        throw new Error(`Channel not found: ${this.channelName}`);
    }

    private async getLiveVideoId(channelId: string): Promise<string> {
        this.incrementApiCall();

        const response = await fetch(
            `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&eventType=live&key=${this.apiKey}`
        );

        const data = await response.json();

        if (data.items && data.items.length > 0) {
            return data.items[0].id.videoId;
        }

        throw new Error('No live stream found for this channel');
    }

    private async getLiveChatId(videoId: string): Promise<void> {
        this.incrementApiCall();

        const response = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${videoId}&key=${this.apiKey}`
        );

        const data = await response.json();

        if (data.items && data.items[0]?.liveStreamingDetails?.activeLiveChatId) {
            this.liveChatId = data.items[0].liveStreamingDetails.activeLiveChatId;
        } else {
            throw new Error('No active live chat found for this video');
        }
    }

    private startAdaptivePolling(): void {
        this.pollMessages();

        // Start with 5 second intervals
        this.pollingIntervalMs = 5000;
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
        console.log(`YouTube polling interval adjusted to ${newInterval}ms`);

        // Restart polling with new interval
        if (this.pollInterval) {
            clearTimeout(this.pollInterval);
            this.scheduleNextPoll();
        }
    }

    private async pollMessages(): Promise<void> {
        try {
            // Check quota limits before making API call
            if (!this.checkQuotaLimits()) {
                this.scheduleNextPoll();
                return;
            }

            this.incrementApiCall();

            let url = `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${this.liveChatId}&part=snippet,authorDetails&key=${this.apiKey}`;

            if (this.nextPageToken) {
                url += `&pageToken=${this.nextPageToken}`;
            }

            const response = await fetch(url);
            const data = await response.json();

            if (data.error) {
                console.error('YouTube API error:', data.error);
                // If quota exceeded, slow down significantly
                if (data.error.code === 403) {
                    this.adjustPollingInterval(60000); // 1 minute
                }
                this.scheduleNextPoll();
                return;
            }

            if (data.items) {
                const newMessageCount = data.items.length;

                data.items.forEach((item: any) => {
                    const message = this.parseYouTubeMessage(item);
                    if (message) {
                        addMessage(message);
                    }
                });

                // Adaptive polling based on message activity
                this.adaptPollingBasedOnActivity(newMessageCount);

                this.nextPageToken = data.nextPageToken || '';
                this.lastMessageCount = newMessageCount;

                // Use pollingIntervalMillis from API response if available
                if (data.pollingIntervalMillis) {
                    this.adjustPollingInterval(Math.max(data.pollingIntervalMillis, 3000));
                } else {
                    this.scheduleNextPoll();
                }
            } else {
                this.scheduleNextPoll();
            }

        } catch (error) {
            console.error('Error polling YouTube messages:', error);

            // On error, increase polling interval to reduce load
            this.adjustPollingInterval(Math.min(this.pollingIntervalMs * 1.5, 30000));
            this.scheduleNextPoll();
        }
    }

    private adaptPollingBasedOnActivity(messageCount: number): void {
        if (messageCount === 0) {
            this.consecutiveEmptyPolls++;

            // If no messages for several polls, slow down
            if (this.consecutiveEmptyPolls >= 3) {
                const newInterval = Math.min(this.pollingIntervalMs * 1.2, 15000); // Max 15 seconds
                if (newInterval !== this.pollingIntervalMs) {
                    this.adjustPollingInterval(newInterval);
                }
            }
        } else {
            this.consecutiveEmptyPolls = 0;

            // If we're getting messages and polling is slow, speed up
            if (messageCount > 3 && this.pollingIntervalMs > 5000) {
                this.adjustPollingInterval(Math.max(this.pollingIntervalMs * 0.8, 5000)); // Min 5 seconds
            }
        }

        // Emergency brake: if we're using too many API calls, slow down drastically
        if (this.hourlyQuotaUsed > 80) {
            this.adjustPollingInterval(30000); // 30 seconds
        }
    }

    private parseYouTubeMessage(item: any): ChatMessage | null {
        if (!item.snippet?.displayMessage || !item.authorDetails?.displayName) {
            return null;
        }

        // Parse emotes from YouTube message
        const emotes = this.parseEmotes(item.snippet);

        return {
            id: `youtube-${item.id}`,
            platform: 'youtube',
            username: item.authorDetails.displayName,
            message: item.snippet.displayMessage,
            timestamp: new Date(item.snippet.publishedAt),
            emotes: emotes
        };
    }

    private parseEmotes(snippet: any): EmoteData[] {
        const emotes: EmoteData[] = [];

        // Check for superChatDetails emotes
        if (snippet.superChatDetails?.userComment) {
            const message = snippet.displayMessage || snippet.superChatDetails.userComment;
            emotes.push(...this.extractYouTubeEmotes(message));
        } else if (snippet.displayMessage) {
            emotes.push(...this.extractYouTubeEmotes(snippet.displayMessage));
        }

        return emotes;
    }

    private extractYouTubeEmotes(message: string): EmoteData[] {
        const emotes: EmoteData[] = [];

        // YouTube emoji pattern - Unicode emoji detection
        const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;

        let match;
        while ((match = emojiRegex.exec(message)) !== null) {
            emotes.push({
                name: match[0],
                url: '', // YouTube emojis are rendered as Unicode, no URL needed
                positions: [[match.index, match.index + match[0].length - 1]]
            });
        }

        return emotes;
    }

    // Add method to get API usage stats
    getApiUsageStats(): { totalCalls: number; hourlyUsed: number; currentInterval: number } {
        return {
            totalCalls: this.apiCallCount,
            hourlyUsed: this.hourlyQuotaUsed,
            currentInterval: this.pollingIntervalMs
        };
    }

    disconnect(): void {
        if (this.pollInterval) {
            clearTimeout(this.pollInterval);
            this.pollInterval = null;
        }

        // Remove event listeners
        if (typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
        }

        updateConnectionStatus('youtube', false);
    }
}