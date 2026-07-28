<script lang="ts">
    import { onMount } from "svelte";
    import { Tooltip } from "bits-ui";
    import { chat } from "./lib/chat.svelte";
    import Sidebar from "./components/Sidebar.svelte";
    import ChatStream from "./components/ChatStream.svelte";
    import ChatInput from "./components/ChatInput.svelte";
    import NetworkInspector from "./components/NetworkInspector.svelte";
    import Settings from "./components/Settings.svelte";
    import Icon from "./components/ui/Icon.svelte";
    import UITooltip from "./components/ui/Tooltip.svelte";
    import "./app.css";

    let inspectorOpen = $state(true);
    let settingsOpen = $state(false);

    onMount(() => {
        chat.init();
    });
</script>

<Tooltip.Provider>
    <div class="app" class:inspector-closed={!inspectorOpen}>
        <Sidebar />

        <main class="chat-pane">
            <header class="pane-head">
                <span class="title">{chat.active?.title ?? "Rairai"}</span>
                <div class="head-actions">
                    {#if chat.isStreaming}<span class="dim">streaming…</span>{/if}
                    <UITooltip
                        label="Settings"
                        class="btn btn-icon"
                        onclick={() => (settingsOpen = true)}
                    >
                        <Icon name="settings" />
                    </UITooltip>
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
        </main>

        {#if inspectorOpen}
            <NetworkInspector />
        {/if}
    </div>

    <Settings bind:open={settingsOpen} />
</Tooltip.Provider>
