import type { ChatMessage } from '../types';
import { addMessage, updateConnectionStatus } from '../stores/chatStore';

// 7TV API endpoints
const SEVENTV_GLOBAL_EMOTES = 'https://7tv.io/v3/emote-sets/global';
const SEVENTV_USER_EMOTES = 'https://7tv.io/v3/users/twitch/';

// Helper types
import type { BadgeData } from '../types';

export class TwitchService {
    private ws: WebSocket | null = null;
    private channel: string = '';
    private channelId: string = '';
    private clientId: string = '';
    private oauthToken: string = '';

    private emoteMap: Map<string, string> = new Map(); // 7TV emote code -> url
    private bttvEmoteMap: Map<string, string> = new Map(); // BTTV emote code -> url
    private badgeMap: Map<string, Map<string, BadgeData>> = new Map(); // setID -> version -> BadgeData

    /**
     * @param channel Twitch channel name
     * @param clientId Twitch application Client-ID (required for Helix API)
     * @param oauthToken OAuth token (Bearer, required for Helix API)
     */
    constructor(channel: string, clientId: string, oauthToken: string) {
        this.channel = channel;
        this.clientId = clientId;
        this.oauthToken = oauthToken;
    }

    async connect(): Promise<void> {
        // Fetch channel ID first (needed for badges)
        await this.fetchChannelId();
        // Fetch badges, 7TV, and BTTV emotes before connecting
        await Promise.all([
            this.fetchBadges(),
            this.fetch7TVEmotes(),
            this.fetchBTTVEmotes()
        ]);
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

                this.ws.onopen = () => {
                    console.log('Connected to Twitch IRC');
                    // Request tags capability for badges/emotes
                    this.ws?.send('CAP REQ :twitch.tv/tags');
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

    // Fetch BTTV global and channel emotes
    private async fetchBTTVEmotes() {
        this.bttvEmoteMap.clear();
        // Global BTTV emotes
        try {
            const globalRes = await fetch('https://api.betterttv.net/3/cached/emotes/global');
            if (globalRes.ok) {
                const globalData = await globalRes.json();
                for (const emote of globalData) {
                    this.bttvEmoteMap.set(emote.code, `https://cdn.betterttv.net/emote/${emote.id}/3x`);
                }
            }
        } catch (e) {
            console.error('Failed to fetch BTTV global emotes', e);
        }
        // Channel BTTV emotes
        try {
            if (this.channelId) {
                const channelRes = await fetch(`https://api.betterttv.net/3/cached/users/twitch/${this.channelId}`);
                if (channelRes.ok) {
                    const channelData = await channelRes.json();
                    if (channelData.channelEmotes) {
                        for (const emote of channelData.channelEmotes) {
                            this.bttvEmoteMap.set(emote.code, `https://cdn.betterttv.net/emote/${emote.id}/3x`);
                        }
                    }
                    if (channelData.sharedEmotes) {
                        for (const emote of channelData.sharedEmotes) {
                            this.bttvEmoteMap.set(emote.code, `https://cdn.betterttv.net/emote/${emote.id}/3x`);
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Failed to fetch BTTV channel emotes', e);
        }
    }
    // Fetch Twitch channel ID for the channel name
    private async fetchChannelId() {
        try {
            const userRes = await fetch(`https://api.ivr.fi/v2/twitch/user?login=${this.channel}`);
            if (userRes.ok) {
                const userData = await userRes.json();
                this.channelId = Array.isArray(userData) ? userData[0]?.id : userData.id;
            }
        } catch (e) {
            console.error('Failed to fetch Twitch channel ID', e);
        }
    }

    // Fetch Twitch badges (global and channel)
    /**
     * Fetch Twitch badges (global and channel) using Helix API endpoints.
     * Requires: this.channelId, this.clientId, this.oauthToken to be set.
     * Maps badges to this.badgeMap (setID -> version -> BadgeData)
     */
    private async fetchBadges() {
        this.badgeMap.clear();
        const clientId = (this as any).clientId;
        const oauthToken = (this as any).oauthToken;
        if (!clientId || !oauthToken) {
            console.error('TwitchService: clientId and oauthToken are required for Helix badge fetching.');
            return;
        }
        const headers = {
            'Client-ID': clientId,
            'Authorization': `Bearer ${oauthToken}`,
        };
        try {
            // Fetch global badges
            const globalRes = await fetch('https://api.twitch.tv/helix/chat/badges/global', { headers });
            if (globalRes.ok) {
                const globalData = await globalRes.json();
                if (globalData.data) {
                    for (const badgeSet of globalData.data) {
                        const setID = badgeSet.set_id;
                        if (!this.badgeMap.has(setID)) this.badgeMap.set(setID, new Map());
                        for (const version of badgeSet.versions) {
                            this.badgeMap.get(setID)?.set(version.id, {
                                setID,
                                version: version.id,
                                url: version.image_url_2x || version.image_url_1x || version.image_url_4x,
                                description: version.title
                            });
                        }
                    }
                }
            } else {
                console.error('[Debug] Failed to fetch global badges:', globalRes.status, await globalRes.text());
            }
            // Fetch channel badges
            if (this.channelId) {
                const channelRes = await fetch(`https://api.twitch.tv/helix/chat/badges?broadcaster_id=${this.channelId}`, { headers });
                if (channelRes.ok) {
                    const channelData = await channelRes.json();
                    if (channelData.data) {
                        for (const badgeSet of channelData.data) {
                            const setID = badgeSet.set_id;
                            if (!this.badgeMap.has(setID)) this.badgeMap.set(setID, new Map());
                            for (const version of badgeSet.versions) {
                                this.badgeMap.get(setID)?.set(version.id, {
                                    setID,
                                    version: version.id,
                                    url: version.image_url_2x || version.image_url_1x || version.image_url_4x,
                                    description: version.title
                                });
                            }
                        }
                    }
                } else {
                    console.error('[Debug] Failed to fetch channel badges:', channelRes.status, await channelRes.text());
                }
            }
        } catch (e) {
            console.error('Failed to fetch Twitch badges (Helix)', e);
        }
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

            // Parse usernotice (subs, raids, etc)
            if (line.includes('USERNOTICE')) {
                const message = this.parseUserNotice(line);
                if (message) {
                    addMessage(message);
                }
            }
        }
    }

    // Parse USERNOTICE for subs, raids, etc
    private parseUserNotice(line: string): ChatMessage | null {
        try {
            let tags: Record<string, string> = {};
            let messageData = line;
            if (line.startsWith('@')) {
                const tagEnd = line.indexOf(' ');
                const tagString = line.slice(1, tagEnd);
                messageData = line.slice(tagEnd + 1);
                tagString.split(';').forEach(tag => {
                    const [key, value] = tag.split('=');
                    tags[key] = value || '';
                });
            }

            // Extract event type
            const msgId = tags['msg-id'] || '';
            let eventType: string | undefined;
            if (msgId.startsWith('sub') || msgId === 'resub' || msgId === 'subgift' || msgId === 'anonsubgift') {
                eventType = 'sub';
            } else if (msgId === 'raid') {
                eventType = 'raid';
            } else if (msgId === 'submysterygift') {
                eventType = 'submysterygift';
            } else if (msgId === 'giftpaidupgrade' || msgId === 'anongiftpaidupgrade') {
                eventType = 'subupgrade';
            } else if (msgId === 'primepaidupgrade') {
                eventType = 'primeupgrade';
            } else {
                eventType = msgId;
            }

            // Parse display name
            const displayName = tags['display-name'] || tags['login'] || 'Twitch User';

            // Parse badges
            let badges: BadgeData[] = [];
            if (tags.badges) {
                const badgePairs = tags.badges.split(',');
                for (const pair of badgePairs) {
                    const [setID, version] = pair.split('/');
                    const badge = this.badgeMap.get(setID)?.get(version);
                    if (badge) badges.push(badge);
                }
            }

            // Parse message (may be empty for some events)
            let message = '';
            const match = messageData.match(/USERNOTICE #\w+ :(.+)/);
            if (match) {
                message = match[1];
            } else if (eventType === 'raid') {
                // Compose a default raid message
                message = `${displayName} is raiding with ${tags['msg-param-viewerCount'] || '?'} viewers!`;
            } else if (eventType === 'sub') {
                message = `${displayName} just subscribed!`;
            } else {
                message = eventType ? `[${eventType}]` : '[Event]';
            }

            // First-time message (not in USERNOTICE, but for future-proofing)
            const isFirst = tags['first-msg'] === '1';

            return {
                id: `twitch-${Date.now()}-${Math.random()}`,
                platform: 'twitch',
                username: displayName,
                message,
                timestamp: new Date(),
                badges: badges.length > 0 ? badges : undefined,
                eventType,
                isFirstTime: isFirst ? true : undefined,
            };
        } catch (error) {
            console.error('Error parsing Twitch USERNOTICE:', error);
            return null;
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
            const originalColor = userColor;
            if (!userColor || userColor === '') {
                userColor = this.generateDefaultColor(username);
            }

            // Parse display name (handles special characters, capitalization)
            const displayName = tags['display-name'] || username;

            // Parse badges
            let badges: BadgeData[] = [];
            if (tags.badges) {
                const badgePairs = tags.badges.split(',');
                for (const pair of badgePairs) {
                    const [setID, version] = pair.split('/');
                    const badge = this.badgeMap.get(setID)?.get(version);
                    if (badge) badges.push(badge);
                }
            }

            // Robust Twitch emote parsing (each position is a separate emote)
            let emotes: any[] = [];
            let twitchEmotePositions: Set<number> = new Set();
            if (tags.emotes) {
                // emotes=emote_id:start-end,start-end/... (e.g. emotes=25:0-4,12-16/1902:6-10)
                const emoteTag = tags.emotes.split('/');
                for (const emoteEntry of emoteTag) {
                    const [emoteId, positions] = emoteEntry.split(':');
                    if (!positions) continue;
                    const posArr = positions.split(',').map(range => {
                        const [start, end] = range.split('-').map(Number);
                        // Mark all covered positions to avoid 7TV overlap
                        for (let i = start; i <= end; i++) twitchEmotePositions.add(i);
                        return [start, end];
                    });
                    // For each position, create a separate emote entry with the actual text
                    for (const [start, end] of posArr) {
                        emotes.push({
                            name: message.substring(start, end + 1),
                            url: `https://static-cdn.jtvnw.net/emoticons/v2/${emoteId}/default/dark/3.0`,
                            positions: [[start, end]],
                            platform: 'twitch',
                        });
                    }
                }
            }

            // 7TV emote parsing (by code, not by tag), but skip if overlaps with Twitch emote positions
            if (this.emoteMap.size > 0) {
                let idx = 0;
                const words = message.split(/(\s+)/); // keep spaces
                for (const word of words) {
                    if (word.trim() && this.emoteMap.has(word)) {
                        const start = idx;
                        const end = idx + word.length - 1;
                        // Check for overlap with any Twitch emote position
                        let overlap = false;
                        for (let i = start; i <= end; i++) {
                            if (twitchEmotePositions.has(i)) {
                                overlap = true;
                                break;
                            }
                        }
                        if (!overlap) {
                            emotes.push({
                                name: word,
                                url: this.emoteMap.get(word),
                                positions: [[start, end]],
                                platform: '7tv',
                            });
                        }
                    }
                    idx += word.length;
                }
            }

            // BTTV emote parsing (by code, not by tag), but skip if overlaps with Twitch emote positions
            if (this.bttvEmoteMap.size > 0) {
                let idx = 0;
                const words = message.split(/(\s+)/); // keep spaces
                for (const word of words) {
                    if (word.trim() && this.bttvEmoteMap.has(word)) {
                        const start = idx;
                        const end = idx + word.length - 1;
                        // Check for overlap with any Twitch emote position
                        let overlap = false;
                        for (let i = start; i <= end; i++) {
                            if (twitchEmotePositions.has(i)) {
                                overlap = true;
                                break;
                            }
                        }
                        // Also skip if already added as 7tv emote
                        if (!overlap && !emotes.some(e => e.name === word && e.positions[0][0] === start)) {
                            emotes.push({
                                name: word,
                                url: this.bttvEmoteMap.get(word),
                                positions: [[start, end]],
                                platform: 'bttv',
                            });
                        }
                    }
                    idx += word.length;
                }
            }

            // First-time message
            const isFirst = tags['first-msg'] === '1';

            return {
                id: `twitch-${Date.now()}-${Math.random()}`,
                platform: 'twitch',
                username: displayName,
                message,
                timestamp: new Date(),
                userColor: userColor,
                emotes: emotes.length > 0 ? emotes : undefined,
                badges: badges.length > 0 ? badges : undefined,
                eventType: undefined,
                isFirstTime: isFirst ? true : undefined,
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