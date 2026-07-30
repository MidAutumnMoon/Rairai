<script lang="ts">
    import { onMount } from "svelte";
    import { chat } from "$lib/chat.svelte";
    import Sidebar from "$components/Sidebar.svelte";
    import Transcript from "$components/chat/Transcript.svelte";
    import ChatInput from "$components/chat/Input.svelte";
    import NetworkInspector from "$components/inspector/Panel.svelte";
    import Switcher from "$components/Switcher.svelte";
    import Settings from "$components/settings/Root.svelte";
    import Icon from "$components/ui/Icon.svelte";
    import Button from "$components/ui/Button.svelte";
    import "./app.css";

    // One sidebar at a time: chat sidebar (chat view) or settings nav (settings
    // view). The settings nav REPLACES the chat sidebar - no double-sidebar.
    // Overlays: inspector drawer + manage-assistants drawer. Editing an
    // assistant is now a tab *inside* Settings, not a standalone view.
    let view = $state<"chat" | "settings">("chat");
    let inspectorOpen = $state(false);
    let manageOpen = $state(false);
    let settingsTab = $state<"providers" | "assistants" | "general" | "data">(
        "providers",
    );
    // When set, the Assistants tab opens this assistant's editor directly.
    let focusAssistantId = $state<string | null>(null);

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
        focusAssistantId = id;
        settingsTab = "assistants";
        view = "settings";
        manageOpen = false;
    }
</script>

<div class="app">
    {#if view === "settings"}
        <aside class="sidebar settings-sidebar">
            <button
                class="sidebar-back"
                onclick={() => (view = "chat")}
                aria-label="Back to chat"
            >
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
                    class:active={settingsTab === "assistants"}
                    onclick={() => {
                        focusAssistantId = null;
                        settingsTab = "assistants";
                    }}
                >
                    Assistants
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
            <Settings tab={settingsTab} {focusAssistantId} />
        {:else}
            <div class="chat-pane">
                <header class="pane-head">
                    <span class="title">{chat.active?.title ?? "Rairai"}</span>
                    <div class="head-actions">
                        {#if chat.isStreaming}<span class="dim">streaming…</span
                            >{/if}
                        <Button
                            label={inspectorOpen
                                ? "Hide inspector"
                                : "Show inspector"}
                            class="btn btn-icon"
                            onclick={() => (inspectorOpen = !inspectorOpen)}
                        >
                            <Icon name="panel-right" />
                        </Button>
                    </div>
                </header>
                <Transcript />
                <ChatInput />
            </div>

            <div class="drawer inspector-drawer" class:open={inspectorOpen}>
                <NetworkInspector onClose={() => (inspectorOpen = false)} />
            </div>

            <div class="drawer manage-drawer" class:open={manageOpen}>
                <Switcher
                    onClose={() => (manageOpen = false)}
                    onEdit={openAssistantEditor}
                />
            </div>
        {/if}
    </main>
</div>
