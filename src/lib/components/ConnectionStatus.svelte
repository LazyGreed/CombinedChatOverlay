<script lang="ts">
    import { connectionStatus } from "../stores/chatStore";
</script>

<div class="status-container">
    <div class="status-item">
        <span class="platform">Twitch</span>
        <span class="indicator" class:connected={$connectionStatus.twitch}
        ></span>
    </div>
    <div class="status-item">
        <span class="platform">Kick</span>
        <span class="indicator" class:connected={$connectionStatus.kick}></span>
    </div>
    <div class="status-item">
        <span class="platform">YouTube</span>
        <span class="indicator" class:connected={$connectionStatus.youtube}
        ></span>
    </div>
    <div class="status-item">
        <span class="platform"> <a href="https://github.com/LazyGreed/CombinedChatOverlay/" target="_blank" style="text-decoration: none; color: white;"> Github </a> </span>
        <span class="indicator" class:connected={true}></span>
    </div>
</div>

<style>
    .status-container {
        position: fixed;
        top: 10px;
        left: 10px;
        display: flex;
        gap: 15px;
        z-index: 1000;
    }

    .status-item {
        display: flex;
        align-items: center;
        gap: 5px;
        background: rgba(0, 0, 0, 0.7);
        padding: 5px 10px;
        border-radius: 15px;
        color: white;
        font-size: 0.9em;
    }

    .indicator {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #dc3545;
        transition: background-color 0.3s;
    }

    .indicator.connected {
        background: #28a745;
    }

    .platform {
        font-weight: 500;
    }
</style>
