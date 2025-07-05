import { writable, derived } from 'svelte/store';
import type { ChatMessage, ChannelConfig, ConnectionStatus } from '../types';

// Add multiple messages at once, deduplicate by id, keep most recent 100
export const addMessages = (newMessages: ChatMessage[]) => {
    messages.update(msgs => {
        // Merge all messages
        const merged = [...msgs, ...newMessages];
        // Deduplicate by id
        const deduped = Array.from(
            merged.reduce((map, msg) => map.set(msg.id, msg), new Map()),
            ([, msg]) => msg
        );
        // Sort by timestamp ascending and keep last 100
        deduped.sort((a, b) => {
            if (a.timestamp && b.timestamp && a.timestamp.getTime && b.timestamp.getTime) {
                return a.timestamp.getTime() - b.timestamp.getTime();
            }
            return 0;
        });
        return deduped.slice(-100);
    });
};

export const messages = writable<ChatMessage[]>([]);
export const channelConfig = writable<ChannelConfig>({});
export const connectionStatus = writable<ConnectionStatus>({
    twitch: false,
    kick: false,
    youtube: false
});

// Derived store for filtered messages (last 100)
export const recentMessages = derived(messages, ($messages) =>
    $messages.slice(-100)
);

// Functions to update stores
export const addMessage = (message: ChatMessage) => {
    messages.update(msgs => {
        // Always deduplicate by id, keep only the most recent 100
        const filtered = msgs.filter(m => m.id !== message.id);
        const updated = [...filtered, message];
        // Sort by timestamp ascending if available, then slice last 100
        updated.sort((a, b) => {
            if (a.timestamp && b.timestamp && a.timestamp.getTime && b.timestamp.getTime) {
                return a.timestamp.getTime() - b.timestamp.getTime();
            }
            return 0;
        });
        return updated.slice(-100);
    });
};

export const updateConnectionStatus = (platform: keyof ConnectionStatus, status: boolean) => {
    connectionStatus.update(current => ({
        ...current,
        [platform]: status
    }));
};

// Local storage integration
export const saveConfig = (config: ChannelConfig) => {
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem('chat-overlay-config', JSON.stringify(config));
    }
    channelConfig.set(config);
};

export const loadConfig = (): ChannelConfig => {
    if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('chat-overlay-config');
        if (saved) {
            const config = JSON.parse(saved);
            channelConfig.set(config);
            return config;
        }
    }
    return {};
};