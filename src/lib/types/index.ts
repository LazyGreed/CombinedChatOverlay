export interface ChatMessage {
    id: string;
    platform: 'twitch' | 'kick' | 'youtube';
    username: string;
    message: string;
    timestamp: Date;
    emotes?: EmoteData[];
    userColor?: string;
}

export interface EmoteData {
    name: string;
    url: string;
    positions: number[][];
}

export interface ChannelConfig {
    twitch?: {
        channel: string;
        username: string;
        token: string;
    };
    kick?: {
        channel: string;
    };
    youtube?: {
        channelName: string;
        apiKey: string;
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
}