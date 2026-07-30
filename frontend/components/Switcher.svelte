<script lang="ts">
    import { chat } from "$lib/chat.svelte";
    import Icon from "./ui/Icon.svelte";

    // Mirrors NetworkInspector: the drawer shell (.drawer.manage-drawer in App)
    // only positions + toggles; this component owns the content - its own header
    // (with the close button) and the assistant list, reading the chat store.
    let {
        onClose,
        onEdit,
    }: {
        onClose: () => void;
        onEdit: (id: string | null) => void;
    } = $props();
</script>

<aside class="manage">
    <header class="drawer-head">
        <span class="drawer-title">Assistants</span>
        <button
            class="btn btn-icon btn-sm"
            onclick={onClose}
            aria-label="Close"
        >
            <Icon name="x" size={16} />
        </button>
    </header>
    <div class="drawer-body">
        <button
            class="btn btn-primary btn-sm drawer-new"
            onclick={() => onEdit(null)}
        >
            <Icon name="plus" size={14} /> New assistant
        </button>
        {#each chat.assistants as a (a.id)}
            <div
                class="manage-row"
                class:active={a.id === chat.activeAssistantId}
            >
                <button
                    class="manage-select"
                    onclick={() => {
                        chat.selectAssistant(a.id);
                        onClose();
                    }}
                    title={a.description || a.name}
                >
                    <span class="emoji">{a.emoji}</span>
                    <span class="manage-info">
                        <span class="manage-name">{a.name}</span>
                        {#if a.description}<span class="manage-desc"
                                >{a.description}</span
                            >{/if}
                    </span>
                </button>
                <button
                    class="btn btn-icon btn-sm"
                    onclick={() => onEdit(a.id)}
                    title="Edit assistant"
                    aria-label="Edit assistant"
                >
                    <Icon name="pencil" size={14} />
                </button>
            </div>
        {/each}
    </div>
</aside>

<style>
    .manage {
        display: flex;
        flex-direction: column;
        background: var(--surface);
        height: 100%;
        min-height: 0;
    }
    .drawer-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.6rem 0.85rem;
        border-bottom: 1px solid var(--border);
        flex: none;
    }
    .drawer-title {
        font-weight: 700;
        font-size: var(--t-sm);
    }
    .drawer-body {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 0.6rem;
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
    }
    .drawer-new {
        align-self: flex-start;
    }
    .manage-row {
        display: flex;
        align-items: stretch;
        border-radius: var(--r);
    }
    .manage-row:hover {
        background: var(--surface-2);
    }
    .manage-row.active {
        background: var(--primary-soft);
    }
    .manage-select {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex: 1;
        min-width: 0;
        padding: 0.45rem 0.5rem;
        text-align: start;
        color: var(--text);
    }
    .manage-row.active .manage-select {
        color: var(--primary);
        font-weight: 600;
    }
    .manage-select .emoji {
        font-size: 1.125rem;
        line-height: 1;
        flex-shrink: 0;
    }
    .manage-info {
        display: flex;
        flex-direction: column;
        min-width: 0;
        gap: 0.05rem;
    }
    .manage-name {
        font-size: var(--t-xs);
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .manage-desc {
        font-size: var(--t-3xs);
        color: var(--text-faint);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
</style>
