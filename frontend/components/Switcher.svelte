<script lang="ts">
    import { chat } from "$lib/chat.svelte";
    import Plus from "@lucide/svelte/icons/plus";
    import X from "@lucide/svelte/icons/x";
    let {
        onClose,
        onEdit,
    }: {
        onClose: () => void;
        onEdit: (id: string | null) => void;
    } = $props();
</script>

<div class="assist-popup" role="dialog" aria-label="Select assistant">
    <header class="assist-head">
        <span class="assist-title">Assistants</span>
        <div class="assist-actions">
            <button class="btn btn-primary btn-sm" onclick={() => onEdit(null)}>
                <Plus size={14} /> Manage
            </button>
            <button class="btn btn-icon btn-sm" onclick={onClose} aria-label="Close">
                <X size={16} />
            </button>
        </div>
    </header>
    <div class="assist-body">
        {#each chat.assistants as a (a.id)}
            <button
                class="assist-option"
                class:active={a.id === chat.activeAssistantId}
                onclick={() => {
                    chat.selectAssistant(a.id);
                    onClose();
                }}
                title={a.description || a.name}
            >
                <span class="assist-emoji">{a.emoji}</span>
                <span class="assist-info">
                    <span class="assist-name">{a.name}</span>
                    {#if a.description}<span class="assist-desc"
                            >{a.description}</span
                        >{/if}
                </span>
            </button>
        {/each}
    </div>
</div>

<style>
    .assist-popup {
        display: flex;
        flex-direction: column;
    }
    .assist-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.75rem 0.85rem 0.55rem;
    }
    .assist-title {
        font-weight: 700;
        font-size: var(--t-sm);
    }
    .assist-actions {
        display: flex;
        align-items: center;
        gap: 0.4rem;
    }
    .assist-actions :global(.btn) {
        min-height: 34px;
        min-width: 34px;
        padding: 0.35rem 0.7rem;
    }
    .assist-body {
        padding: 0.25rem 0.5rem 0.5rem;
        min-height: 10rem;
        max-height: calc(min(720px, 80vh) - 3.5rem);
    }
    .assist-option {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        width: 100%;
        padding: 0.5rem 0.6rem;
        border-radius: var(--r);
        text-align: start;
        color: var(--text);
        font-size: var(--t-xs);
        transition:
            background var(--transition),
            color var(--transition);
    }
    .assist-option:hover {
        background: var(--surface-2);
    }
    .assist-option.active {
        background: var(--primary-soft);
        color: var(--primary);
        font-weight: 600;
    }
    .assist-emoji {
        font-size: 1.125rem;
        line-height: 1;
        flex-shrink: 0;
    }
    .assist-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .assist-info {
        display: flex;
        flex-direction: column;
        min-width: 0;
        gap: 0.05rem;
    }
    .assist-desc {
        font-size: var(--t-3xs);
        color: var(--text-faint);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
</style>
