<script lang="ts">
import { chat } from "$lib/chat.svelte";
import Icon from "./ui/Icon.svelte";

// Mirrors NetworkInspector: the drawer shell (.drawer.manage-drawer in App)
// only positions + toggles; this component owns the content - its own header
// (with the close button) and the assistant list, reading the chat store.
let { onClose, onEdit }: {
    onClose: () => void;
    onEdit: (id: string | null) => void;
} = $props();
</script>

<aside class="manage">
    <header class="drawer-head">
        <span class="drawer-title">Assistants</span>
        <button class="btn btn-icon btn-sm" onclick={onClose}
            aria-label="Close">
            <Icon name="x" size={16} />
        </button>
    </header>
    <div class="drawer-body">
        <button class="btn btn-primary btn-sm drawer-new" onclick={() => onEdit(null)}>
            <Icon name="plus" size={14} /> New assistant
        </button>
        {#each chat.assistants as a (a.id)}
            <div class="manage-row" class:active={a.id === chat.activeAssistantId}>
                <button
                    class="manage-select"
                    onclick={() => { chat.selectAssistant(a.id); onClose(); }}
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
