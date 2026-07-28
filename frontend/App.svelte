<script lang="ts">
    import { onMount } from "svelte";
    import { Tooltip } from "bits-ui";
    import { chat } from "./lib/chat.svelte";
    import Sidebar from "./components/Sidebar.svelte";
    import ChatStream from "./components/ChatStream.svelte";
    import ChatInput from "./components/ChatInput.svelte";
    import NetworkInspector from "./components/NetworkInspector.svelte";
    import Settings from "./components/Settings.svelte";
    import AssistantEditor from "./components/AssistantEditor.svelte";
    import Icon from "./components/ui/Icon.svelte";
    import UITooltip from "./components/ui/Tooltip.svelte";
    import "./app.css";

    // Single full-page view at a time: chat (default), settings, or the
    // assistant editor. The inspector is a slide-over drawer, closed by default
    // (it's a debug tool, not a permanent panel).
    let view = $state<"chat" | "settings" | "assistant">("chat");
    let editingAssistantId = $state<string | null>(null);
    let inspectorOpen = $state(false);

    onMount(() => {
        chat.init();
    });

    // Clicking a chat / assistant / "new chat" in the sidebar returns to the
    // chat view from any full-page view (Settings / assistant editor). Done
    // explicitly (not via an activeId effect) so it works even when the target
    // is already the active chat.
    function navigateToChat() {
        view = "chat";
    }

    function openSettings() {
        view = "settings";
    }
    function openAssistantEditor(id: string | null) {
        editingAssistantId = id;
        view = "assistant";
    }
</script>

<Tooltip.Provider>
    <div class="app">
        <Sidebar
            onOpenSettings={openSettings}
            onEditAssistant={openAssistantEditor}
            onNavigateToChat={navigateToChat}
        />

        <main class="main-pane">
            {#if view === "settings"}
                <Settings onBack={() => (view = "chat")} />
            {:else if view === "assistant"}
                <AssistantEditor
                    assistantId={editingAssistantId}
                    onBack={() => (view = "chat")}
                />
            {:else}
                <div class="chat-pane">
                    <header class="pane-head">
                        <span class="title">{chat.active?.title ?? "Rairai"}</span>
                        <div class="head-actions">
                            {#if chat.isStreaming}<span class="dim">streaming…</span>{/if}
                            <UITooltip
                                label={inspectorOpen ? "Hide inspector" : "Show inspector"}
                                class="btn btn-icon"
                                onclick={() => (inspectorOpen = !inspectorOpen)}
                            >
                                <Icon name="panel-right" />
                            </UITooltip>
                        </div>
                    </header>
                    <ChatStream />
                    <ChatInput />
                </div>

                <div class="inspector-drawer" class:open={inspectorOpen}>
                    <NetworkInspector onClose={() => (inspectorOpen = false)} />
                </div>
            {/if}
        </main>
    </div>
</Tooltip.Provider>
