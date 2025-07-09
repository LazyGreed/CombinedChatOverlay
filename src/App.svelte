<script lang="ts">
    import ConnectionStatus from "./lib/components/ConnectionStatus.svelte";
    import ChatContainer from "./lib/components/ChatContainer.svelte";
    import ChannelConfig from "./lib/components/ChannelConfig.svelte";
    let hasMessages = false;
    let showConfigOnHover = false;
    function handleHasMessages(event: CustomEvent<{ hasMessages: boolean }>) {
        hasMessages = event.detail.hasMessages;
    }
</script>

<main>
    <div
        class="status-bar-hover-area"
        on:mouseenter={() => (showConfigOnHover = true)}
        on:mouseleave={() => (showConfigOnHover = false)}
        role="region"
        aria-label="Show channel config"
    >
        <ConnectionStatus />
        {#if !hasMessages || showConfigOnHover}
            <ChannelConfig />
        {/if}
    </div>
    <ChatContainer on:hasMessages={handleHasMessages} />
</main>

<style>
    .status-bar-hover-area {
        position: relative;
        z-index: 1200;
        display: flex;
        align-items: flex-start;
        gap: 12px;
        width: 100vw;
        /* pointer-events: auto; */
    }

    :global(body) {
        margin: 0;
        padding: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
            sans-serif;
    }

    main {
        width: 100vw;
        height: 100vh;
        overflow: hidden;
    }
</style>
