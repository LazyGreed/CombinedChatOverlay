import ReconnectingWebSocket from 'reconnecting-websocket';
import type { ChatMessage, KickChatMessage, EmoteData } from '../types'; 
import { addMessage, updateConnectionStatus } from '../stores/chatStore';

export class KickService {
    private ws: ReconnectingWebSocket | null = null;
    private channel: string = '';
    private chatroomId: number | null = null;

    constructor(channel: string) {
        this.channel = channel;
    }

    async connect(): Promise<void> {
        try {
            // First, get the chatroom ID for the channel
            await this.getChatroomId();

            if (!this.chatroomId) {
                throw new Error('Could not get chatroom ID for channel');
            }

            // Connect to Kick's WebSocket with the correct app key and cluster
            const wsUrl = `wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0&flash=false`;

            this.ws = new ReconnectingWebSocket(wsUrl, [], {
                maxReconnectionDelay: 10000,
                minReconnectionDelay: 1000,
                reconnectionDelayGrowFactor: 1.3,
                connectionTimeout: 4000,
                maxRetries: 5,
                debug: false,
            });

            return new Promise((resolve, reject) => {
                if (!this.ws) return reject(new Error('WebSocket not initialized'));

                this.ws.onopen = () => {
                    console.log('Connected to Kick WebSocket');
                    this.subscribe();
                };

                this.ws.onmessage = (event) => {
                    this.handleMessage(event.data);
                };

                this.ws.onclose = (event) => {
                    console.log(`Kick WebSocket closed: ${event.code} ${event.reason}`);
                    updateConnectionStatus('kick', false);
                };

                this.ws.onerror = (error) => {
                    console.error('Kick WebSocket error:', error);
                    updateConnectionStatus('kick', false);
                    reject(error);
                };

                // Resolve after successful subscription
                setTimeout(() => {
                    if (this.ws?.readyState === WebSocket.OPEN) {
                        resolve();
                    }
                }, 2000);
            });

        } catch (error) {
            console.error('Kick connection error:', error);
            updateConnectionStatus('kick', false);
            throw error;
        }
    }

    private async getChatroomId(): Promise<void> {
        try {
            const response = await fetch(`https://kick.com/api/v2/channels/${this.channel}`);
            if (!response.ok) {
                throw new Error(`Failed to get channel info: ${response.status}`);
            }

            const data = await response.json();
            this.chatroomId = data.chatroom?.id;

            if (!this.chatroomId) {
                throw new Error('Chatroom ID not found in channel data');
            }

            console.log(`Got Kick chatroom ID: ${this.chatroomId} for channel: ${this.channel}`);
        } catch (error) {
            console.error('Error getting Kick chatroom ID:', error);
            throw error;
        }
    }

    private subscribe(): void {
        if (!this.ws || !this.chatroomId) return;

        console.log(`Subscribing to Kick channel: chatrooms.${this.chatroomId}.v2`);

        const subscribeMessage = {
            event: 'pusher:subscribe',
            data: {
                channel: `chatrooms.${this.chatroomId}.v2`,
                auth: '', // Kick doesn't require auth for public chat
            }
        };

        this.ws.send(JSON.stringify(subscribeMessage));
    }

    private handleMessage(data: string): void {
        try {
            const parsedData = JSON.parse(data);
            console.log('Kick message received:', JSON.stringify(parsedData));

            // Handle connection confirmation
            if (parsedData.event === 'pusher:connection_established') {
                console.log('Kick WebSocket connection established');
                updateConnectionStatus('kick', true);
                return;
            }

            // Handle subscription success
            if (parsedData.event === 'pusher:subscription_succeeded') {
                console.log('Successfully subscribed to Kick channel');
                updateConnectionStatus('kick', true);
                return;
            }

            // Handle subscription error
            if (parsedData.event === 'pusher:subscription_error') {
                console.error('Kick subscription error:', parsedData.data);
                updateConnectionStatus('kick', false);
                return;
            }

            // Handle chat messages
            if (parsedData.event === 'App\\Events\\ChatMessageEvent') {
                const messageData: KickChatMessage = JSON.parse(parsedData.data);
                const message = this.parseKickMessage(messageData);
                if (message) {
                    addMessage(message);
                }
            }

        } catch (error) {
            console.error('Error parsing Kick message:', error);
        }
    }

    private parseKickMessage(data: KickChatMessage): ChatMessage | null {
        try {
            if (!data.content || !data.sender) return null;

            const emotes = this.extractKickEmotes(data.content);

            // Use a stable, unique ID for deduplication
            return {
                id: `kick-${data.id}`,
                platform: 'kick',
                username: data.sender.username || data.sender.slug || 'Unknown',
                message: data.content, // Keep original message content for parsing in component
                timestamp: new Date(data.created_at || Date.now()),
                userColor: data.sender.identity?.color,
                emotes: emotes, // Add extracted emotes
            };
        } catch (error) {
            console.error('Error parsing Kick message data:', error);
            return null;
        }
    }

    // New method to extract Kick emotes from the message content
    private extractKickEmotes(messageText: string): EmoteData[] {
        const emotes: EmoteData[] = [];
        const emoteRegex = /\[emote:(\d+):([^\]]+)\]/g // Matches [emote:ID:NAME]

        let match;
        while ((match = emoteRegex.exec(messageText)) !== null) {
            const emoteId = match[1];
            const emoteName = match[2];
            const emoteUrl = `https://files.kick.com/emotes/${emoteId}/fullsize`; // Construct Kick emote URL

            emotes.push({
                name: emoteName,
                url: emoteUrl,
                positions: [[match.index, match.index + match[0].length - 1]],
                platform: 'kick',
            });
        }
        return emotes;
    }

    disconnect(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        updateConnectionStatus('kick', false);
    }
}