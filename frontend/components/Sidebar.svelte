<script lang="ts">
    import { chat } from "../lib/chat.svelte";
    import Icon from "./ui/Icon.svelte";

    let {
        onOpenSettings,
        onEditAssistant,
        onNavigateToChat,
    }: {
        onOpenSettings: () => void;
        onEditAssistant: (id: string | null) => void;
        onNavigateToChat: () => void;
    } = $props();
</script>

<aside class="sidebar">
    <header class="pane-head">
        <span class="brand">Rairai</span>
    </header>

    <section class="side-section assistants">
        <div class="side-head">
            <span class="side-label">Assistants</span>
            <button class="btn btn-ghost btn-sm" onclick={() => onEditAssistant(null)}>
                <Icon name="plus" size={14} /> New
            </button>
        </div>
        <div class="side-list">
            {#each chat.assistants as a (a.id)}
                <div class="assistant-row" class:active={a.id === chat.activeAssistantId}>
                    <button
                        class="assistant-select"
                        onclick={() => { chat.selectAssistant(a.id); onNavigateToChat(); }}
                        title={a.description || a.name}
                    >
                        <span class="emoji">{a.emoji}</span>
                        <span class="assistant-info">
                            <span class="name">{a.name}</span>
                            {#if a.description}<span class="desc">{a.description}</span>{/if}
                        </span>
                    </button>
                    <button
                        class="btn btn-icon btn-sm assistant-edit"
                        onclick={() => onEditAssistant(a.id)}
                        title="Edit assistant"
                        aria-label="Edit assistant"
                    >
                        <Icon name="pencil" size={14} />
                    </button>
                </div>
            {/each}
        </div>
    </section>

    <section class="side-section chats">
        <div class="side-head">
            <span class="side-label">Chats</span>
            <button class="btn btn-ghost btn-sm" onclick={() => { chat.newConversation(); onNavigateToChat(); }}>
                <Icon name="plus" size={14} /> New
            </button>
        </div>
        <div class="side-list">
            {#each chat.conversations as conv (conv.id)}
                <button
                    class="convo"
                    class:active={conv.id === chat.activeId}
                    onclick={() => { chat.open(conv.id); onNavigateToChat(); }}
                >
                    <span class="dot"></span>
                    <span class="t">{conv.title}</span>
                </button>
            {/each}
        </div>
    </section>

    <footer class="side-footer">
        <button class="side-foot-btn" onclick={onOpenSettings}>
            <Icon name="settings" size={16} />
            <span>Settings</span>
        </button>
    </footer>
</aside>
