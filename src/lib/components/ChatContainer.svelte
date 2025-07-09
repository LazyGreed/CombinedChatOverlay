<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { recentMessages, channelConfig } from "../stores/chatStore";
    import { TwitchService } from "../services/twitchService";
    import { KickService } from "../services/kickService";
    import { YouTubeService } from "../services/youtubeService";
    import ChatMessage from "./ChatMessage.svelte";

    import { createEventDispatcher } from "svelte";
    let chatContainer: HTMLElement;
    const dispatch = createEventDispatcher();
    $: hasMessages = $recentMessages.length > 0;
    $: dispatch("hasMessages", { hasMessages });
    let services: (TwitchService | KickService | YouTubeService)[] = [];
    let isNearBottom = true;
    let ignoreNextScroll = false;
    let lastProgrammaticScroll = 0;

    // pauseChat and resumeChat removed
    function scrollToBottom() {
        if (chatContainer) {
            ignoreNextScroll = true;
            lastProgrammaticScroll = Date.now();
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    }

    // Always autoscroll to bottom when new messages arrive and user is near bottom
    $: if ($recentMessages.length > 0) {
        setTimeout(() => {
            if (isNearBottom) {
                scrollToBottom();
            }
        }, 50);
    }

    onMount(() => {
        // Connect to services based on config
        const unsubscribe = channelConfig.subscribe(async (config) => {
            // Disconnect existing services
            services.forEach((service) => service.disconnect());
            services = [];
            try {
                // Connect to Twitch
                if (config.twitch?.channel) {
                    const TWITCH_CLIENT_ID =
                        import.meta.env.VITE_TWITCH_CLIENT_ID || "";
                    const TWITCH_OAUTH_TOKEN =
                        import.meta.env.VITE_TWITCH_OAUTH_TOKEN || "";
                    if (!TWITCH_CLIENT_ID || !TWITCH_OAUTH_TOKEN) {
                        console.error(
                            "Twitch Client-ID and OAuth token are required for TwitchService.",
                        );
                    } else {
                        const twitchService = new TwitchService(
                            config.twitch.channel,
                            TWITCH_CLIENT_ID,
                            TWITCH_OAUTH_TOKEN,
                        );
                        await twitchService.connect();
                        services.push(twitchService);
                    }
                }

                // Connect to Kick
                if (config.kick?.channel) {
                    const kickService = new KickService(config.kick.channel);
                    try {
                        await kickService.connect();
                        services.push(kickService);
                    } catch (error) {
                        console.error("Kick connection failed:", error);
                    }
                }

                // Connect to YouTube
                if (config.youtube?.channelName) {
                    const youtubeService = new YouTubeService(
                        config.youtube.channelName,
                    );
                    await youtubeService.connect();
                    services.push(youtubeService);
                }
            } catch (error) {
                console.error("Error connecting to services:", error);
            }
        });

        return () => {
            unsubscribe();
        };
    });

    onDestroy(() => {
        services.forEach((service) => service.disconnect());
    });
</script>

<div class="chat-wrapper">
    <div class="chat-container" bind:this={chatContainer}>
        {#each $recentMessages as item (item.id)}
            <ChatMessage message={item} />
        {/each}

        {#if $recentMessages.length === 0}
            <div class="no-messages">
                <p>
                    No messages yet. Configure your channels to start receiving
                    chat messages!
                </p>
            </div>
        {/if}
    </div>
</div>

<style>
    /* removed .top-bar-hover-area styles */

    .chat-wrapper {
        height: 100vh;
        position: relative;
        display: flex;
        flex-direction: column;
    }

    @keyframes pulse {
        0%,
        100% {
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        }
        50% {
            box-shadow: 0 4px 25px rgba(255, 107, 107, 0.6);
        }
    }

    @keyframes bounce {
        0% {
            transform: translateY(0);
        }
        100% {
            transform: translateY(-3px);
        }
    }

    .chat-container {
        flex: 1;
        overflow-y: auto;
        padding: 50px 10px 10px 10px;
        box-sizing: border-box;
        scroll-behavior: smooth;
    }

    .no-messages {
        display: flex;
        align-items: center;
        justify-content: center;
        height: calc(100% - 60px);
        color: white;
        text-align: center;
    }

    .no-messages p {
        background: rgba(0, 0, 0, 0.5);
        padding: 20px;
        border-radius: 8px;
        max-width: 400px;
    }

    /* Enhanced scrollbar styling */
    .chat-container::-webkit-scrollbar {
        width: 8px;
    }

    .chat-container::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 4px;
    }

    .chat-container::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.3);
        border-radius: 4px;
        transition: background 0.2s ease;
    }

    .chat-container::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.5);
    }

    /* Firefox scrollbar styling */
    .chat-container {
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1);
    }

    /* Mobile optimizations */
    @media (max-width: 768px) {
        .chat-container {
            padding: 10px;
        }
    }

    /* Reduce motion for users who prefer it */
    @media (prefers-reduced-motion: reduce) {
        @keyframes pulse {
            0%,
            100% {
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
            }
        }

        @keyframes bounce {
            0%,
            100% {
                transform: translateY(0);
            }
        }
    }
</style>
