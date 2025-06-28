<script lang="ts">
    import { messages } from "../stores/chatStore";

    let showDebug = false;
    let debugMessages: string[] = [];

    // Add debug logging
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;

    console.log = (...args) => {
        originalConsoleLog(...args);
        debugMessages = [...debugMessages.slice(-50), `LOG: ${args.join(" ")}`];
    };

    console.error = (...args) => {
        originalConsoleError(...args);
        debugMessages = [
            ...debugMessages.slice(-50),
            `ERROR: ${args.join(" ")}`,
        ];
    };

    function clearDebug() {
        debugMessages = [];
    }

    function toggleDebug() {
        showDebug = !showDebug;
    }
</script>

<div class="debug-container">
    <button class="debug-toggle" on:click={toggleDebug}>
        🐛 Debug ({$messages.length} messages)
    </button>

    {#if showDebug}
        <div class="debug-panel">
            <div class="debug-header">
                <h4>Debug Information</h4>
                <button on:click={clearDebug}>Clear</button>
            </div>

            <div class="debug-section">
                <h5>Recent Messages ({$messages.length})</h5>
                <div class="debug-messages">
                    {#each $messages.slice(-10) as msg}
                        <div class="debug-message">
                            <strong>{msg.platform}</strong>: {msg.username} - {msg.message}
                        </div>
                    {/each}
                </div>
            </div>

            <div class="debug-section">
                <h5>Console Logs</h5>
                <div class="debug-logs">
                    {#each debugMessages.slice(-20) as log}
                        <div class="debug-log">{log}</div>
                    {/each}
                </div>
            </div>
        </div>
    {/if}
</div>

<style>
    .debug-container {
        position: fixed;
        bottom: 10px;
        right: 10px;
        z-index: 1000;
    }

    .debug-toggle {
        background: #28a745;
        color: white;
        border: none;
        padding: 8px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.9em;
    }

    .debug-panel {
        position: absolute;
        bottom: 100%;
        right: 0;
        background: white;
        border: 1px solid #ccc;
        border-radius: 8px;
        padding: 15px;
        width: 400px;
        max-height: 500px;
        overflow-y: auto;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .debug-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
        padding-bottom: 10px;
        border-bottom: 1px solid #eee;
    }

    .debug-header h4 {
        margin: 0;
    }

    .debug-header button {
        background: #dc3545;
        color: white;
        border: none;
        padding: 4px 8px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.8em;
    }

    .debug-section {
        margin-bottom: 15px;
    }

    .debug-section h5 {
        margin: 0 0 8px 0;
        color: #333;
    }

    .debug-messages,
    .debug-logs {
        max-height: 150px;
        overflow-y: auto;
        background: #f8f9fa;
        padding: 8px;
        border-radius: 4px;
        font-family: monospace;
        font-size: 0.8em;
    }

    .debug-message,
    .debug-log {
        margin-bottom: 4px;
        padding: 2px 4px;
        background: white;
        border-radius: 2px;
        word-break: break-all;
    }

    .debug-log {
        color: #666;
    }
</style>
