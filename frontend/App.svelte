<script lang="ts">
    import { onMount } from "svelte";
    import { chat } from "./lib/chat.svelte";
    import Sidebar from "./components/Sidebar.svelte";
    import ChatStream from "./components/ChatStream.svelte";
    import ChatInput from "./components/ChatInput.svelte";
    import NetworkInspector from "./components/NetworkInspector.svelte";
    import Settings from "./components/Settings.svelte";
    import "./app.css";

    let inspectorOpen = $state(true);
    let view = $state<"chat" | "settings">("chat");

    onMount(() => {
        chat.init();
    });
</script>

{#if view === "settings"}
    <Settings onClose={() => (view = "chat")} />
{:else}
    <div class="app" class:inspector-closed={!inspectorOpen}>
        <Sidebar />

        <main class="chat-pane">
            <header class="pane-head">
                <span class="title">{chat.active?.title ?? "Rairai"}</span>
                <div class="head-actions">
                    <span class="provider">{chat.isStreaming ? "streaming…" : ""}</span>
                    <button onclick={() => (view = "settings")} title="Settings">⚙</button>
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
{/if}

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
    .head-actions {
        display: flex;
        align-items: center;
        gap: 0.6rem;
    }
    .provider {
        color: var(--text-faint);
        font-size: 12px;
    }
</style>
