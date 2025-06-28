<script lang="ts">
    import ChannelConfig from "./lib/components/ChannelConfig.svelte";
    import ConnectionStatus from "./lib/components/ConnectionStatus.svelte";
    import ChatContainer from "./lib/components/ChatContainer.svelte";
</script>

<main>
    <ChannelConfig />
    <ConnectionStatus />
    <ChatContainer />
</main>

<style>
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
