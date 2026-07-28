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

    // One sidebar at a time: chat sidebar (chat/assistant views) or settings
    // nav (settings view). The settings nav REPLACES the chat sidebar - no
    // double-sidebar. Overlays: inspector drawer + manage-assistants drawer.
    let view = $state<"chat" | "settings" | "assistant">("chat");
    let editingAssistantId = $state<string | null>(null);
    let inspectorOpen = $state(false);
    let manageOpen = $state(false);
    let settingsTab = $state<"providers" | "general" | "data">("providers");

    onMount(() => {
        chat.init();
    });

    function navigateToChat() {
        view = "chat";
    }
    function openSettings() {
        view = "settings";
    }
    function openAssistantEditor(id: string | null) {
        editingAssistantId = id;
        view = "assistant";
        manageOpen = false;
    }
</script>

<Tooltip.Provider>
    <div class="app">
        {#if view === "settings"}
            <aside class="sidebar settings-sidebar">
                <button class="sidebar-back" onclick={() => (view = "chat")} aria-label="Back to chat">
                    <Icon name="arrow-left" size={18} />
                    <span>Back</span>
                </button>
                <nav class="settings-nav">
                    <button
                        class="settings-nav-item"
                        class:active={settingsTab === "providers"}
                        onclick={() => (settingsTab = "providers")}
                    >
                        Providers
                    </button>
                    <button
                        class="settings-nav-item"
                        class:active={settingsTab === "general"}
                        onclick={() => (settingsTab = "general")}
                    >
                        General
                    </button>
                    <button
                        class="settings-nav-item"
                        class:active={settingsTab === "data"}
                        onclick={() => (settingsTab = "data")}
                    >
                        Data
                    </button>
                </nav>
            </aside>
        {:else}
            <Sidebar
                onOpenManage={() => (manageOpen = true)}
                onOpenSettings={openSettings}
                onNavigateToChat={navigateToChat}
            />
        {/if}

        <main class="main-pane">
            {#if view === "settings"}
                <Settings tab={settingsTab} />
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

                <div class="drawer inspector-drawer" class:open={inspectorOpen}>
                    <NetworkInspector onClose={() => (inspectorOpen = false)} />
                </div>

                <div class="drawer manage-drawer" class:open={manageOpen}>
                    <header class="drawer-head">
                        <span class="drawer-title">Assistants</span>
                        <button class="btn btn-icon btn-sm" onclick={() => (manageOpen = false)} aria-label="Close">
                            <Icon name="x" size={16} />
                        </button>
                    </header>
                    <div class="drawer-body">
                        <button class="btn btn-primary btn-sm drawer-new" onclick={() => openAssistantEditor(null)}>
                            <Icon name="plus" size={14} /> New assistant
                        </button>
                        {#each chat.assistants as a (a.id)}
                            <div class="manage-row" class:active={a.id === chat.activeAssistantId}>
                                <button
                                    class="manage-select"
                                    onclick={() => { chat.selectAssistant(a.id); manageOpen = false; }}
                                    title={a.description || a.name}
                                >
                                    <span class="emoji">{a.emoji}</span>
                                    <span class="manage-info">
                                        <span class="manage-name">{a.name}</span>
                                        {#if a.description}<span class="manage-desc">{a.description}</span>{/if}
                                    </span>
                                </button>
                                <button
                                    class="btn btn-icon btn-sm"
                                    onclick={() => openAssistantEditor(a.id)}
                                    title="Edit assistant"
                                    aria-label="Edit assistant"
                                >
                                    <Icon name="pencil" size={14} />
                                </button>
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}
        </main>
    </div>
</Tooltip.Provider>
