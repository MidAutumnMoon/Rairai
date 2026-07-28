<script lang="ts">
    import { chat } from "./lib/chat.svelte";
    import Sidebar from "./components/Sidebar.svelte";
    import ChatStream from "./components/ChatStream.svelte";
    import ChatInput from "./components/ChatInput.svelte";
    import NetworkInspector from "./components/NetworkInspector.svelte";

    let inspectorOpen = $state(true);

    // Seed an empty conversation on first load.
    if (!chat.active) chat.newConversation();
</script>

<div class="app" class:inspector-closed={!inspectorOpen}>
    <Sidebar />

    <main class="chat-pane">
        <header class="pane-head">
            <span class="title">{chat.active?.title ?? "Rairai"}</span>
            <div class="head-actions">
                <span class="provider">{chat.isStreaming ? "streaming…" : ""}</span>
                <button onclick={() => (inspectorOpen = !inspectorOpen)}>
                    {inspectorOpen ? "Hide inspector" : "Show inspector"}
                </button>
            </div>
        </header>
        <ChatStream />
        <ChatInput />
    </main>

    {#if inspectorOpen}
        <NetworkInspector />
    {/if}
</div>

<style>
    .app {
        display: grid;
        grid-template-columns: 256px 1fr 420px;
        height: 100vh;
        overflow: hidden;
    }
    .app.inspector-closed {
        grid-template-columns: 256px 1fr;
    }
    .chat-pane {
        display: flex;
        flex-direction: column;
        min-width: 0;
        border-left: 1px solid var(--border);
    }
    .app:not(.inspector-closed) .chat-pane {
        border-right: 1px solid var(--border);
    }
    .pane-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.5rem 0.85rem;
        border-bottom: 1px solid var(--border);
        background: var(--bg-elev);
        min-height: 44px;
    }
    .pane-head .title {
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .head-actions {
        display: flex;
        align-items: center;
        gap: 0.6rem;
    }
    .provider {
        color: var(--text-faint);
        font-size: 12px;
    }
    .pane-head button {
        background: var(--bg-elev2);
        border: 1px solid var(--border);
        border-radius: 4px;
        padding: 0.2rem 0.55rem;
    }
    .pane-head button:hover {
        border-color: var(--accent);
    }
</style>
