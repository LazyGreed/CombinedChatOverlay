export interface ChatMessage {
    id: string;
    platform: 'twitch' | 'kick' | 'youtube';
    username: string;
    message: string;
    timestamp: Date;
    emotes?: EmoteData[];
    userColor?: string;
    badges?: BadgeData[];
    eventType?: string; // e.g. 'sub', 'raid', etc.
    isFirstTime?: boolean;
}

// Twitch badge data
export interface BadgeData {
    setID: string; // e.g. moderator, subscriber
    version: string; // e.g. 1, 12
    url: string; // badge image url
    description?: string;
}

export interface EmoteData {
    name: string;
    url: string;
    positions: number[][];
    platform?: 'twitch' | 'kick' | 'youtube'; // Add platform to EmoteData
}

export interface ChannelConfig {
    twitch?: {
        channel: string;
    };
    kick?: {
        channel: string;
    };
    youtube?: {
        channelName: string;
    };
}

export interface ConnectionStatus {
    twitch: boolean;
    kick: boolean;
    youtube: boolean;
}

export interface KickChannelInfo {
    id: number;
    user_id: number;
    slug: string;
    is_banned: boolean;
    playback_url: string;
    name_updated_at: string | null;
    vod_enabled: boolean;
    subscription_enabled: boolean;
    can_host: boolean;
    chatroom: {
        id: number;
        chatable_type: string;
        channel_id: number;
        created_at: string;
        updated_at: string;
        chat_mode_old: string;
        chat_mode: string;
        slow_mode: boolean;
        chatable_id: number;
        followers_mode: boolean;
        subscribers_mode: boolean;
        emotes_mode: boolean;
        message_interval: number;
        following_min_duration: number;
    };
}

export interface KickChatMessage {
    id: string;
    chatroom_id: number;
    content: string;
    type: string;
    created_at: string;
    sender: {
        id: number;
        username: string;
        slug: string;
        identity?: {
            color: string;
            badges: any[];
        };
    };
    // Kick specific emote data
    metadata?: {
        message_id: string;
        emote_id?: string;
        emote_name?: string;
        // other metadata properties if they exist
    };
    emotes?: KickEmoteData[]; // Add Kick specific emotes
}

// Define the KickEmoteData interface based on Kick's API response for emotes
export interface KickEmoteData {
    id: number;
    name: string;
    src: string;
}

// YouTube-specific badge data
export interface YouTubeBadgeData {
    name: string;
    url: string;
    description?: string;
}