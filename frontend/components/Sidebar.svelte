<script lang="ts">
import { chat } from "$lib/chat.svelte";
import Icon from "./ui/Icon.svelte";

let {
    onOpenManage,
    onOpenSettings,
    onNavigateToChat,
}: {
    onOpenManage: () => void;
    onOpenSettings: () => void;
    onNavigateToChat: () => void;
} = $props();

const active = $derived(
    chat.assistants.find((a) => a.id === chat.activeAssistantId) ?? null,
);
</script>

<aside class="sidebar">
    <!-- Active assistant (compact card; click opens the manage drawer).
         This is the primary selector - always shows which assistant is active. -->
    <button class="aa-card" onclick={onOpenManage} title="Manage assistants">
        {#if active}
            <span class="aa-emoji">{active.emoji}</span>
            <span class="aa-info">
                <span class="aa-name">{active.name}</span>
                {#if active.description}<span class="aa-desc">{active.description}</span>{/if}
            </span>
        {:else}
            <span class="aa-name">No assistant</span>
        {/if}
        <Icon name="chevron-down" size={16} class="aa-chev" />
    </button>

    <!-- Chats (scoped to the active assistant; stable - never pushed by assistant count). -->
    <div class="convos">
        <div class="convos-head">
            <span class="convos-label">Chats</span>
            <button class="btn btn-ghost btn-sm"
                onclick={() => { chat.newConversation(); onNavigateToChat(); }}>
                <Icon name="plus" size={14} /> New
            </button>
        </div>
        <div class="convos-list">
            {#each chat.conversations as conv (conv.id)}
                <button class="convo" class:active={conv.id === chat.activeId} onclick={() => { chat.open(conv.id); onNavigateToChat(); }}>
                    <span class="dot"></span>
                    <span class="t">{conv.title}</span>
                </button>
            {/each}
        </div>
    </div>

    <footer class="side-footer">
        <button class="side-foot-btn" onclick={onOpenSettings}>
            <Icon name="settings" size={16} />
            <span>Settings</span>
        </button>
    </footer>
</aside>
