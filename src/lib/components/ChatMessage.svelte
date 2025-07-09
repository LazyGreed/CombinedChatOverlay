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
            second: "2-digit",
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
    ): string {
        if (!messageText) return "";

        let emoteRanges: [number, number, any][] = [];
        if (emotes && emotes.length > 0) {
            for (const emote of emotes) {
                const [start, end] = emote.positions[0];
                emoteRanges.push([start, end, emote]);
            }
        }

        // Collect link ranges
        const urlRegex = /https:\/\/[\w\-._~:/?#[\]@!$&'()*+,;=%]+/gi;
        let linkRanges: [number, number, string][] = [];
        let match;
        while ((match = urlRegex.exec(messageText)) !== null) {
            linkRanges.push([
                match.index,
                match.index + match[0].length - 1,
                match[0],
            ]);
        }

        // Collect mention ranges
        const mentionRegex = /@(\w+)/g;
        let mentionRanges: [number, number, string][] = [];
        while ((match = mentionRegex.exec(messageText)) !== null) {
            mentionRanges.push([
                match.index,
                match.index + match[0].length - 1,
                match[1],
            ]);
        }

        // Merge all ranges, prioritize emotes > links > mentions > text
        let allRanges: Array<{
            type: "emote" | "link" | "mention";
            start: number;
            end: number;
            value: string;
            data?: any;
        }> = [];
        for (const [start, end, emote] of emoteRanges) {
            allRanges.push({
                type: "emote",
                start,
                end,
                value: messageText.substring(start, end + 1),
                data: emote,
            });
        }
        for (const [start, end, url] of linkRanges) {
            // Only add if not overlapping with emote
            if (
                !emoteRanges.some(
                    ([eStart, eEnd]) => start <= eEnd && end >= eStart,
                )
            )
                allRanges.push({ type: "link", start, end, value: url });
        }
        for (const [start, end, username] of mentionRanges) {
            // Only add if not overlapping with emote or link
            if (
                !emoteRanges.some(
                    ([eStart, eEnd]) => start <= eEnd && end >= eStart,
                ) &&
                !linkRanges.some(
                    ([lStart, lEnd]) => start <= lEnd && end >= lStart,
                )
            )
                allRanges.push({
                    type: "mention",
                    start,
                    end,
                    value: username,
                });
        }
        allRanges.sort((a, b) => a.start - b.start);

        // Build output
        let result = "";
        let idx = 0;
        for (const token of allRanges) {
            if (token.start > idx) {
                // Add plain text between tokens
                result += messageText.slice(idx, token.start);
            }
            if (token.type === "emote") {
                const emote = token.data;
                result += `<img src="${emote.url}" alt="${emote.name}" title="${emote.name}" class="emote" />`;
            } else if (token.type === "link") {
                result += `<a href="${token.value}" target="_blank" rel="noopener noreferrer" class="chat-link">${token.value}</a>`;
            } else if (token.type === "mention") {
                let mentionColor = generateUserColor(token.value.toLowerCase());
                if (
                    token.value.toLowerCase() ===
                        message.username.toLowerCase() &&
                    message.userColor
                ) {
                    mentionColor = message.userColor;
                }
                result += `<span class="mention" style="color: ${mentionColor}; font-weight: 600;">@${token.value}</span>`;
            }
            idx = token.end + 1;
        }
        if (idx < messageText.length) {
            result += messageText.slice(idx);
        }

        // Fallback: Replace any emote text with image if not already replaced (for Twitch, 7TV, BTTV)
        if (emotes && emotes.length > 0) {
            for (const emote of emotes) {
                if (!emote.url || typeof emote.url !== "string" || emote.url.trim() === "") continue;
                // Only replace if not already present as an <img>
                // Use strict word boundaries to avoid partial matches (e.g. abusive vs abusive2)
                // Allow emotes at start/end or surrounded by whitespace/punctuation
                const emoteRegex = new RegExp(`(?<=^|[\s.,!?;:()\[\]{}<>"'])${emote.name}(?=$|[\s.,!?;:()\[\]{}<>"'])`, "g");
                if (result.includes(emote.name)) {
                    result = result.replace(
                        emoteRegex,
                        `<img src=\"${emote.url}\" alt=\"${emote.name}\" title=\"${emote.name}\" class=\"emote\" />`
                    );
                }
            }
        }
        return result;
    }
</script>

<div
    class="message {message.isFirstTime ? 'ftc' : ''}"
    style="border-left-color: {getPlatformColor(message.platform)}"
>
    <div class="message-header">
        {#if message.badges && message.badges.length > 0}
            {#each message.badges as badge}
                <img
                    src={badge.url}
                    alt={badge.setID}
                    title={`${badge.description ? badge.description + " " : ""}[${badge.setID}]`}
                    class="twitch-badge"
                />
            {/each}
        {/if}
        {#if message.eventType === "raid"}
            <span class="event-indicator raid">RAID</span>
        {:else if message.eventType === "sub"}
            <span class="event-indicator sub">SUB</span>
        {:else if message.eventType === "submysterygift"}
            <span class="event-indicator sub">SUB GIFT</span>
        {/if}
        {#if message.isFirstTime}
            <span class="event-indicator first">FIRST</span>
        {/if}
        <span
            class="username"
            style="color: {message.userColor ||
                getPlatformColor(message.platform)}"
        >
            {message.username}
        </span>
        <span class="timestamp">{formatTime(message.timestamp)}</span>
    </div>

    <div class="message-content">
        {@html parseMessageWithMentions(message.message, message.emotes)}
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
    .message.ftc {
        background: linear-gradient(90deg, #e0c3fc 0%, #8ec5fc 100%);
        color: #2d1457;
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
        font-weight: 700;
    }

    .event-indicator {
        font-size: 0.7em;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 8px;
        margin-right: 4px;
        color: #fff;
        letter-spacing: 1px;
        text-shadow: 0 1px 2px #000a;
        vertical-align: middle;
        display: inline-block;
    }
    .event-indicator.raid {
        background: linear-gradient(90deg, #ff5e62, #ff9966);
    }
    .event-indicator.sub {
        background: linear-gradient(90deg, #9146ff, #53fc18);
    }
    .event-indicator.first {
        background: #f9eaf9;
        color: #222;
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
        height: calc(1.5em + 2px);
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

    .twitch-badge {
        height: 1.2em;
        width: auto;
        margin-right: 2px;
        vertical-align: middle;
        border-radius: 2px;
        background: #222;
        box-shadow: 0 0 2px #000a;
    }
    .twitch-badge {
        height: 1.2em;
        width: auto;
        margin-right: 2px;
        vertical-align: middle;
        border-radius: 2px;
        background: #222;
        box-shadow: 0 0 2px #000a;
    }

    /* Link styling */
    .message-content :global(.chat-link) {
        color: #1e90ff;
        text-decoration: none;
        font-weight: 500;
        border-bottom: 1px dotted #1e90ff;
        transition:
            color 0.2s ease,
            border-color 0.2s ease;
    }

    .message-content :global(.chat-link:hover) {
        color: #0c7cd5;
        border-color: #0c7cd5;
    }
    /* Style for :emote_name: fallback (YouTube emotes as text) */
    .message-content :global(.yt-emote-fallback) {
        background: rgba(255, 255, 255, 0.08);
        border-radius: 4px;
        padding: 0 2px;
        margin: 0 1px;
        font-size: 1em;
        letter-spacing: 0.5px;
    }
</style>
