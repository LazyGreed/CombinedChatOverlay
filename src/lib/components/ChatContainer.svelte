<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { recentMessages, channelConfig } from "../stores/chatStore";
    import { TwitchService } from "../services/twitchService";
    import { KickService } from "../services/kickService";
    import { YouTubeService } from "../services/youtubeService";
    import ChatMessage from "./ChatMessage.svelte";


    let chatContainer: HTMLElement;
    let services: (TwitchService | KickService | YouTubeService)[] = [];

    // Pause on scroll functionality
    let isPaused = false;
    let scrollTimeout: number | null = null;
    let unreadCount = 0;
    // let pauseResumeButton: HTMLElement;
    let lastScrollTop = 0;
    let isNearBottom = true;
let ignoreNextScroll = false;
let lastProgrammaticScroll = 0;

    // Store messages that arrive while paused
    let pausedMessages: typeof $recentMessages = [];
    let allMessages: typeof $recentMessages = [];

    function handleScroll() {
        if (!chatContainer) return;

        // Ignore scrolls within 400ms of a programmatic scroll
        if (Date.now() - lastProgrammaticScroll < 800) {
            lastScrollTop = chatContainer.scrollTop;
            return;
        }

        if (ignoreNextScroll) {
            ignoreNextScroll = false;
            lastScrollTop = chatContainer.scrollTop;
            return;
        }

        const { scrollTop, scrollHeight, clientHeight } = chatContainer;
        const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);

        // Consider "near bottom" if within 100px of the bottom
        isNearBottom = distanceFromBottom <= 100;

        // Only pause if user scrolls up by more than 20px and not near bottom
        if ((lastScrollTop - scrollTop) > 20 && !isNearBottom && !isPaused) {
            pauseChat();
        }

        // If user scrolls to bottom while paused, resume
        if (isNearBottom && isPaused) {
            resumeChat();
        }

        lastScrollTop = scrollTop;

        // Clear existing timeout
        if (scrollTimeout) {
            clearTimeout(scrollTimeout);
        }

        // Set new timeout to auto-resume after 5 seconds of no scrolling
        if (isPaused) {
            scrollTimeout = window.setTimeout(() => {
                if (isPaused) {
                    resumeChat();
                }
            }, 5000); // Auto-resume after 5 seconds of inactivity
        }
    }

    function pauseChat() {
        isPaused = true;
        console.log("Chat paused - scroll detected");

        // Store current state
        allMessages = [...$recentMessages];
        pausedMessages = [];
        unreadCount = 0;
    }

    function resumeChat() {
        isPaused = false;
        console.log("Chat resumed");

        // Clear timeout
        if (scrollTimeout) {
            clearTimeout(scrollTimeout);
            scrollTimeout = null;
        }

        // Reset counters
        unreadCount = 0;
        pausedMessages = [];

        // Scroll to bottom after a brief delay
        setTimeout(() => {
            scrollToBottom();
        }, 100);
    }

    function scrollToBottom() {
        if (chatContainer) {
            ignoreNextScroll = true;
            lastProgrammaticScroll = Date.now();
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    }

    function togglePause() {
        if (isPaused) {
            resumeChat();
        } else {
            pauseChat();
        }
    }

    // Auto-scroll only when not paused and new messages arrive
    $: if (!isPaused && $recentMessages.length > 0) {
        setTimeout(() => {
            if (!isPaused && isNearBottom) {
                scrollToBottom();
            }
        }, 50);
    }

    onMount(() => {
        // Add scroll listener
        if (chatContainer) {
            chatContainer.addEventListener("scroll", handleScroll, {
                passive: true,
            });
        }

        // Connect to services based on config
        const unsubscribe = channelConfig.subscribe(async (config) => {
            // Disconnect existing services
            services.forEach((service) => service.disconnect());
            services = [];
            try {
                // Connect to Twitch
                if (config.twitch?.channel) {
                    const twitchService = new TwitchService(
                        config.twitch.channel
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
                if (config.youtube?.channelName) {
                    const youtubeService = new YouTubeService(
                        config.youtube.channelName
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
            if (chatContainer) {
                chatContainer.removeEventListener("scroll", handleScroll);
            }
        };
    });

    onDestroy(() => {
        services.forEach((service) => service.disconnect());
        if (scrollTimeout) {
            clearTimeout(scrollTimeout);
        }
    });
</script>

<div class="chat-wrapper">
    <!-- Pause/Resume Controls -->
    {#if isPaused && unreadCount > 0}
        <div class="chat-controls">
            <div class="unread-indicator">
                {unreadCount} new message{unreadCount === 1 ? "" : "s"}
            </div>
        </div>
    {/if}

    <div class="chat-container" bind:this={chatContainer}>

        <!-- TEMP: Fallback rendering for debugging -->
        {#each (isPaused ? allMessages : $recentMessages) as item (item.id)}
            <ChatMessage {item} message={item} />
        {/each}

        {#if (isPaused ? allMessages : $recentMessages).length === 0}
            <div class="no-messages">
                <p>
                    No messages yet. Configure your channels to start receiving
                    chat messages!
                </p>
            </div>
        {/if}
        <!-- TEMP DEBUG REMOVED -->
    </div>
</div>

<style>
    .chat-wrapper {
        height: 100vh;
        position: relative;
        display: flex;
        flex-direction: column;
    }

    .chat-controls {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 2000;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        pointer-events: none;
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

    .unread-indicator {
        background: linear-gradient(45deg, #ff6b6b, #ee5a24);
        color: white;
        padding: 6px 12px;
        border-radius: 15px;
        font-size: 12px;
        font-weight: 600;
        text-align: center;
        pointer-events: auto;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
        animation: bounce 1s ease-in-out infinite alternate;
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
        padding: 60px 10px 10px 10px;
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
        .chat-controls {
            top: auto;
            bottom: 80px;
            left: 10px;
            right: 10px;
            transform: none;
        }

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
