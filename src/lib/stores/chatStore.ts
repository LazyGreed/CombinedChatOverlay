import { writable, derived } from 'svelte/store';
import type { ChatMessage, ChannelConfig, ConnectionStatus } from '../types';

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
    messages.update(msgs => [...msgs, message]);
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