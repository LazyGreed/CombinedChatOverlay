import type { ChatMessage } from '../types';
import { addMessage, updateConnectionStatus } from '../stores/chatStore';

// 7TV API endpoints
const SEVENTV_GLOBAL_EMOTES = 'https://7tv.io/v3/emote-sets/global';
const SEVENTV_USER_EMOTES = 'https://7tv.io/v3/users/twitch/';

export class TwitchService {
    private ws: WebSocket | null = null;
    private channel: string = '';

    private emoteMap: Map<string, string> = new Map(); // emote code -> url

    constructor(channel: string) {
        this.channel = channel;
    }

    async connect(): Promise<void> {
        // Fetch 7TV emotes before connecting
        await this.fetch7TVEmotes();
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

                this.ws.onopen = () => {
                    console.log('Connected to Twitch IRC');
                    // Send NICK command for anonymous connection
                    const anonNick = 'justinfan' + Math.floor(Math.random() * 1000000);
                    this.ws?.send(`NICK ${anonNick}`);
                    // Now join the channel
                    this.joinChannel();
                };

                this.ws.onmessage = (event) => {
                    this.handleMessage(event.data);
                };

                this.ws.onclose = () => {
                    console.log('Disconnected from Twitch');
                    updateConnectionStatus('twitch', false);
                };

                this.ws.onerror = (error) => {
                    console.error('Twitch WebSocket error:', error);
                    updateConnectionStatus('twitch', false);
                    reject(error);
                };

                // Resolve when successfully joined channel
                setTimeout(() => {
                    if (this.ws?.readyState === WebSocket.OPEN) {
                        resolve();
                    }
                }, 2000);

            } catch (error) {
                reject(error);
            }
        });
    }

    // Fetch 7TV global and channel emotes
    private async fetch7TVEmotes() {
        this.emoteMap.clear();
        // Fetch global emotes
        try {
            const globalRes = await fetch(SEVENTV_GLOBAL_EMOTES);
            if (globalRes.ok) {
                const globalData = await globalRes.json();
                if (globalData.emotes) {
                    for (const emote of globalData.emotes) {
                        this.emoteMap.set(emote.name, `https://cdn.7tv.app/emote/${emote.id}/4x.webp`);
                    }
                }
            }
        } catch (e) {
            console.error('Failed to fetch 7TV global emotes', e);
        }
        // Fetch channel emotes
        try {
            // Get Twitch user ID from channel name
            const userRes = await fetch(`https://api.ivr.fi/v2/twitch/user?login=${this.channel}`);
            if (userRes.ok) {
                const userData = await userRes.json();
                const userId = Array.isArray(userData) ? userData[0]?.id : userData.id;
                if (userId) {
                    const channelRes = await fetch(SEVENTV_USER_EMOTES + userId);
                    if (channelRes.ok) {
                        const channelData = await channelRes.json();
                        if (channelData.emote_set && channelData.emote_set.emotes) {
                            for (const emote of channelData.emote_set.emotes) {
                                this.emoteMap.set(emote.name, `https://cdn.7tv.app/emote/${emote.id}/4x.webp`);
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Failed to fetch 7TV channel emotes', e);
        }
    }

    private joinChannel() {
        if (!this.ws) return;
        // Only join channel, no authentication
        this.ws.send(`JOIN #${this.channel}`);
    }

    private handleMessage(data: string) {
        const lines = data.split('\r\n');

        for (const line of lines) {
            if (line.trim() === '') continue;

            // Handle PING/PONG
            if (line.startsWith('PING')) {
                this.ws?.send('PONG :tmi.twitch.tv');
                continue;
            }

            // Handle successful join
            if (line.includes('366')) {
                updateConnectionStatus('twitch', true);
                continue;
            }

            // Parse chat message
            if (line.includes('PRIVMSG')) {
                const message = this.parsePrivMsg(line);
                if (message) {
                    addMessage(message);
                }
            }
        }
    }

    private parsePrivMsg(line: string): ChatMessage | null {
        try {
            // Parse IRC message with tags
            // Format: @tags :user!user@user.tmi.twitch.tv PRIVMSG #channel :message

            let tags: Record<string, string> = {};
            let messageData = line;

            // Extract tags if present
            if (line.startsWith('@')) {
                const tagEnd = line.indexOf(' ');
                const tagString = line.slice(1, tagEnd);
                messageData = line.slice(tagEnd + 1);

                // Parse tags
                tagString.split(';').forEach(tag => {
                    const [key, value] = tag.split('=');
                    tags[key] = value || '';
                });
            }

            // Parse the actual message
            const match = messageData.match(/:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)/);
            if (!match) return null;

            const [, username, message] = match;

            // Get user color from tags, fallback to default colors if not set
            let userColor = tags.color;

            // If no color is set by user, generate a default color based on username
            if (!userColor || userColor === '') {
                userColor = this.generateDefaultColor(username);
            }

            // Parse display name (handles special characters, capitalization)
            const displayName = tags['display-name'] || username;

            // 7TV emote parsing
            const emotes: any[] = [];
            if (this.emoteMap.size > 0) {
                // Find all emote codes in the message
                // Split message by space, but keep track of positions
                let idx = 0;
                const words = message.split(/(\s+)/); // keep spaces
                for (const word of words) {
                    if (word.trim() && this.emoteMap.has(word)) {
                        // Find start/end in original message
                        const start = idx;
                        const end = idx + word.length - 1;
                        emotes.push({
                            name: word,
                            url: this.emoteMap.get(word),
                            positions: [[start, end]],
                            platform: 'twitch',
                        });
                    }
                    idx += word.length;
                }
            }

            return {
                id: `twitch-${Date.now()}-${Math.random()}`,
                platform: 'twitch',
                username: displayName,
                message,
                timestamp: new Date(),
                userColor: userColor,
                emotes: emotes.length > 0 ? emotes : undefined
            };
        } catch (error) {
            console.error('Error parsing Twitch message:', error);
            return null;
        }
    }

    private generateDefaultColor(username: string): string {
        // Twitch's default color palette for users without custom colors
        const defaultColors = [
            '#FF0000', // Red
            '#0000FF', // Blue
            '#00FF00', // Green
            '#B22222', // FireBrick
            '#FF7F50', // Coral
            '#9ACD32', // YellowGreen
            '#FF4500', // OrangeRed
            '#2E8B57', // SeaGreen
            '#DAA520', // GoldenRod
            '#D2691E', // Chocolate
            '#5F9EA0', // CadetBlue
            '#1E90FF', // DodgerBlue
            '#FF69B4', // HotPink
            '#8A2BE2', // BlueViolet
            '#00FF7F'  // SpringGreen
        ];

        // Generate a consistent color based on username hash
        let hash = 0;
        for (let i = 0; i < username.length; i++) {
            hash = username.charCodeAt(i) + ((hash << 5) - hash);
        }

        const colorIndex = Math.abs(hash) % defaultColors.length;
        return defaultColors[colorIndex];
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        updateConnectionStatus('twitch', false);
    }
}