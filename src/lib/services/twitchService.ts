import type { ChatMessage } from '../types';
import { addMessage, updateConnectionStatus } from '../stores/chatStore';

export class TwitchService {
    private ws: WebSocket | null = null;
    private channel: string = '';
    private username: string = '';
    private token: string = '';

    constructor(channel: string, username: string, token: string) {
        this.channel = channel;
        this.username = username;
        this.token = token;
    }

    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

                this.ws.onopen = () => {
                    console.log('Connected to Twitch IRC');
                    this.authenticate();
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

    private authenticate() {
        if (!this.ws) return;

        // Request tags capability to get user colors and other metadata
        this.ws.send('CAP REQ :twitch.tv/tags');
        this.ws.send('CAP REQ :twitch.tv/commands');
        this.ws.send(`PASS oauth:${this.token}`);
        this.ws.send(`NICK ${this.username}`);
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

            return {
                id: `twitch-${Date.now()}-${Math.random()}`,
                platform: 'twitch',
                username: displayName,
                message,
                timestamp: new Date(),
                userColor: userColor
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