<script lang="ts">
    import type { ChatMessage } from "../types";

    export let message: ChatMessage;

    function getPlatformColor(platform: string): string {
        switch (platform) {
            case "twitch":
                return "#9146ff";
            case "kick":
                return "#53fc18";
            case "youtube":
                return "#ff0000";
            default:
                return "#666";
        }
    }

    function formatTime(date: Date): string {
        return date.toLocaleTimeString("en-US", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    // Generate consistent color for usernames (same logic as TwitchService)
    function generateUserColor(username: string): string {
        const defaultColors = [
            "#FF0000",
            "#0000FF",
            "#00FF00",
            "#B22222",
            "#FF7F50",
            "#9ACD32",
            "#FF4500",
            "#2E8B57",
            "#DAA520",
            "#D2691E",
            "#5F9EA0",
            "#1E90FF",
            "#FF69B4",
            "#8A2BE2",
            "#00FF7F",
        ];

        let hash = 0;
        for (let i = 0; i < username.length; i++) {
            hash = username.charCodeAt(i) + ((hash << 5) - hash);
        }

        const colorIndex = Math.abs(hash) % defaultColors.length;
        return defaultColors[colorIndex];
    }

    function parseMessageWithMentions(
        messageText: string,
        emotes: any[] = [],
        platform: 'twitch' | 'kick' | 'youtube', // Pass platform to tailor emote handling
    ): string {

        if (!messageText) return "";

        let parsedMessage = messageText;

        // Handle emotes for all platforms (Twitch, Kick, YouTube)
        if (emotes && emotes.length > 0) {
            // Sort emotes by their starting position in descending order
            emotes.sort((a, b) => b.positions[0][0] - a.positions[0][0]);

            for (const emote of emotes) {
                const [start, end] = emote.positions[0]; // Assuming single position for simplicity
                const emotePlaceholder = messageText.substring(start, end + 1);
                // Only replace with <img> if a URL is present (for image emotes)
                if (emote.url) {
                    const emoteImg = `<img src="${emote.url}" alt="${emote.name}" class="emote" />`;
                    parsedMessage = parsedMessage.slice(0, start) + emoteImg + parsedMessage.slice(end + 1);
                }
                // If no URL, leave the text as-is (for Unicode emoji)
            }
        }

        // Handle @mentions - look for @username patterns
        const mentionRegex = /@(\w+)/g;
        parsedMessage = parsedMessage.replace(
            mentionRegex,
            (match, username) => {
                // For Twitch, try to use a consistent color based on the mentioned username
                let mentionColor = generateUserColor(username.toLowerCase());

                // If this is the same user as the message sender, use their color
                if (
                    username.toLowerCase() === message.username.toLowerCase() &&
                    message.userColor
                ) {
                    mentionColor = message.userColor;
                }

                return `<span class="mention" style="color: ${mentionColor}; font-weight: 600;">@${username}</span>`;
            },
        );

        return parsedMessage;
    }
</script>

<div
    class="message"
    style="border-left-color: {getPlatformColor(message.platform)}"
>
    <div class="message-header">
        <span
            class="username"
            style="color: {message.userColor ||
                getPlatformColor(message.platform)}"
        >
            {message.username}
        </span>
        <span
            class="platform-badge"
            style="background-color: {getPlatformColor(message.platform)}"
        >
            {message.platform.toUpperCase()}
        </span>
        <span class="timestamp">{formatTime(message.timestamp)}</span>
    </div>
    <div class="message-content">
        {@html parseMessageWithMentions(message.message, message.emotes, message.platform)}
    </div>
</div>

<style>
    .message {
        border-left: 3px solid #666;
        padding: 8px 12px;
        margin-bottom: 4px;
        color: #fff;
        background: rgba(0, 0, 0, 0.5);
        border-radius: 0 4px 4px 0;
        animation: slideIn 0.3s ease-out;
    }

    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateX(-20px);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }

    .message-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
        font-size: 0.85em;
    }

    .username {
        font-weight: 600;
    }

    .platform-badge {
        font-size: 0.7em;
        padding: 2px 6px;
        border-radius: 10px;
        color: white;
        font-weight: 500;
    }

    .timestamp {
        color: #fff;
        font-size: 1em;
        margin-left: auto;
    }

    .message-content {
        word-wrap: break-word;
        line-height: 1.4;
    }

    /* Emote styling */
    .message-content :global(.emote) {
        height: 1.5em; /* Adjust as needed */
        width: auto;
        vertical-align: middle;
        margin: 0 2px;
    }

    /* Mention styling */
    .message-content :global(.mention) {
        font-weight: 600;
        text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
        transition: opacity 0.2s ease;
    }

    .message-content :global(.mention:hover) {
        opacity: 0.8;
        cursor: pointer;
    }

    /* YouTube emoji styling - make them slightly larger */
    .message-content {
        font-size: 1.1em;
    }
</style>