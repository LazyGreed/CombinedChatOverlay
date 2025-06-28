<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { recentMessages, channelConfig } from "../stores/chatStore";
    import { TwitchService } from "../services/twitchService";
    import { KickService } from "../services/kickService";
    import { YouTubeService } from "../services/youtubeService";
    import ChatMessage from "./ChatMessage.svelte";

    let chatContainer: HTMLElement;
    let services: (TwitchService | KickService | YouTubeService)[] = [];

    onMount(() => {
        // Auto-scroll to bottom when new messages arrive
        const unsubscribe = recentMessages.subscribe(() => {
            if (chatContainer) {
                setTimeout(() => {
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                }, 10);
            }
        });

        // Connect to services based on config
        channelConfig.subscribe(async (config) => {
            // Disconnect existing services
            services.forEach((service) => service.disconnect());
            services = [];

            try {
                // Connect to Twitch
                if (
                    config.twitch?.channel &&
                    config.twitch?.username &&
                    config.twitch?.token
                ) {
                    const twitchService = new TwitchService(
                        config.twitch.channel,
                        config.twitch.username,
                        config.twitch.token,
                    );
                    await twitchService.connect();
                    services.push(twitchService);
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
                if (config.youtube?.channelName && config.youtube?.apiKey) {
                    const youtubeService = new YouTubeService(
                        config.youtube.channelName,
                        config.youtube.apiKey,
                    );
                    await youtubeService.connect();
                    services.push(youtubeService);
                }
            } catch (error) {
                console.error("Error connecting to services:", error);
            }
        });

        return unsubscribe;
    });

    onDestroy(() => {
        services.forEach((service) => service.disconnect());
    });
</script>

<div class="chat-container" bind:this={chatContainer}>
    {#each $recentMessages as message (message.id)}
        <ChatMessage {message} />
    {/each}

    {#if $recentMessages.length === 0}
        <div class="no-messages">
            <p>
                No messages yet. Configure your channels to start receiving chat
                messages!
            </p>
        </div>
    {/if}
</div>

<style>
    .chat-container {
        height: 100vh;
        overflow-y: auto;
        padding: 60px 10px 10px 10px;
        box-sizing: border-box;
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

    /* Scrollbar styling */
    .chat-container::-webkit-scrollbar {
        width: 6px;
    }

    .chat-container::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.1);
    }

    .chat-container::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.3);
        border-radius: 3px;
    }

    .chat-container::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.5);
    }
</style>
