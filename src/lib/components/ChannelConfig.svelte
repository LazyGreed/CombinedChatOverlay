<script lang="ts">
  import { saveConfig, loadConfig } from "../stores/chatStore";
  import type { ChannelConfig } from "../types";
  import { onMount } from "svelte";

  let config: ChannelConfig = {
    twitch: { channel: "", username: "", token: "" },
    kick: { channel: "" },
    youtube: { channelName: "", apiKey: "" },
  };
  let showConfig = false;

  // Load config on mount
  onMount(() => {
    const loadedConfig = loadConfig();

    // Ensure all platform configs exist with proper defaults
    config = {
      twitch: {
        channel: loadedConfig.twitch?.channel || "",
        username: loadedConfig.twitch?.username || "",
        token: loadedConfig.twitch?.token || "",
      },
      kick: {
        channel: loadedConfig.kick?.channel || "",
      },
      youtube: {
        channelName: loadedConfig.youtube?.channelName || "",
        apiKey: loadedConfig.youtube?.apiKey || "",
      },
    };
  });

  function handleSave() {
    saveConfig(config);
    showConfig = false;
  }

  function toggleConfig() {
    showConfig = !showConfig;
  }
</script>

<div class="config-container">
  <button class="config-toggle" on:click={toggleConfig}>
    ⚙️ Configure Channels
  </button>

  {#if showConfig}
    <div class="config-panel">
      <h3>Channel Configuration</h3>

      <!-- Twitch Configuration -->
      <div class="platform-config">
        <h4>🟣 Twitch</h4>
        <input
          type="text"
          placeholder="Channel name"
          bind:value={config.twitch!.channel}
        />
        <input
          type="text"
          placeholder="Your username"
          bind:value={config.twitch!.username}
        />
        <input
          type="password"
          placeholder="OAuth token (oauth:xxxxx)"
          bind:value={config.twitch!.token}
        />
        <small
          >Get your OAuth token from <a
            href="https://twitchapps.com/tmi/"
            target="_blank">twitchapps.com/tmi</a
          ></small
        >
      </div>

      <!-- Kick Configuration -->
      <div class="platform-config">
        <h4>🟢 Kick</h4>
        <input
          type="text"
          placeholder="Channel name"
          bind:value={config.kick!.channel}
        />
      </div>

      <!-- YouTube Configuration -->
      <div class="platform-config">
        <h4>🔴 YouTube</h4>
        <input
          type="text"
          placeholder="Channel name (e.g., @channelname or channelname)"
          bind:value={config.youtube!.channelName}
        />
        <input
          type="password"
          placeholder="API Key"
          bind:value={config.youtube!.apiKey}
        />
        <small
          >Get your API key from <a
            href="https://console.developers.google.com/"
            target="_blank">Google Cloud Console</a
          ></small
        >
        <small>Enable YouTube Data API v3 in your Google Cloud project</small>
        <small>Channel must be currently live streaming for chat to work</small>
      </div>

      <div class="config-actions">
        <button on:click={handleSave} class="save-button"
          >Save Configuration</button
        >
        <button on:click={toggleConfig} class="cancel-button">Cancel</button>
      </div>

      <div class="config-help">
        <details>
          <summary>Troubleshooting Help</summary>
          <div class="troubleshooting">
            <h5>Common Issues:</h5>
            <ul>
              <li>
                <strong>Twitch not connecting:</strong> Check OAuth token format
                (should start with "oauth:")
              </li>
              <li>
                <strong>YouTube not working:</strong> Ensure the channel is live
                streaming and API key is valid
              </li>
              <li>
                <strong>No messages appearing:</strong> Check browser console for
                error messages
              </li>
            </ul>
          </div>
        </details>
      </div>
    </div>
  {/if}
</div>

<style>
  .config-container {
    position: fixed;
    top: 10px;
    right: 10px;
    z-index: 1000;
  }

  .config-toggle {
    background: #333;
    color: white;
    border: none;
    padding: 8px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }

  .config-toggle:hover {
    background: #555;
  }

  .config-panel {
    position: absolute;
    top: 100%;
    right: 0;
    background: white;
    border: 1px solid #ccc;
    border-radius: 12px;
    padding: 20px;
    min-width: 350px;
    max-width: 400px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    max-height: 80vh;
    overflow-y: auto;
  }

  .platform-config {
    margin-bottom: 20px;
    padding-bottom: 15px;
    border-bottom: 1px solid #eee;
  }

  .platform-config:last-of-type {
    border-bottom: none;
  }

  .platform-config h4 {
    margin: 0 0 10px 0;
    color: #333;
    font-size: 16px;
  }

  .platform-config input {
    width: 100%;
    padding: 8px 12px;
    margin-bottom: 8px;
    border: 1px solid #ddd;
    border-radius: 6px;
    box-sizing: border-box;
    font-size: 14px;
  }

  .platform-config input:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
  }

  .platform-config small {
    color: #666;
    font-size: 0.8em;
    display: block;
    margin-bottom: 4px;
  }

  .config-actions {
    display: flex;
    gap: 10px;
    margin-top: 20px;
  }

  .config-actions button {
    flex: 1;
    padding: 12px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 500;
  }

  .save-button {
    background: #007bff;
    color: white;
  }

  .save-button:hover {
    background: #0056b3;
  }

  .cancel-button {
    background: #6c757d;
    color: white;
  }

  .cancel-button:hover {
    background: #545b62;
  }

  .config-help {
    margin-top: 12px;
  }

  .config-help details {
    background: #f8f9fa;
    border-radius: 6px;
    padding: 8px;
  }

  .config-help summary {
    cursor: pointer;
    font-weight: 500;
    color: #495057;
    padding: 4px;
  }

  .troubleshooting {
    margin-top: 8px;
    padding: 8px;
  }

  .troubleshooting ul {
    margin: 8px 0;
    padding-left: 20px;
  }

  .troubleshooting li {
    margin-bottom: 4px;
    font-size: 13px;
  }

  .troubleshooting h5 {
    margin: 8px 0 4px 0;
    color: #333;
  }
</style>
