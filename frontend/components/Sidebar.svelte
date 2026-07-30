<script lang="ts">
import { chat } from "$lib/chat.svelte";
import Icon from "./ui/Icon.svelte";
import Switcher from "./Switcher.svelte";

let {
    onOpenSettings,
    onNavigateToChat,
    onEditAssistant,
}: {
    onOpenSettings: () => void;
    onNavigateToChat: () => void;
    onEditAssistant: (id: string | null) => void;
} = $props();

const active = $derived(
    chat.assistants.find((a) => a.id === chat.activeAssistantId) ?? null,
);

let popupOpen = $state(false);

function togglePopup() {
    popupOpen = !popupOpen;
}
function closePopup() {
    popupOpen = false;
}
</script>

<aside class="sidebar">
    <!-- Active assistant (compact card; click opens the selection popup). -->
    <div class="aa-wrap">
        <button class="aa-card" onclick={togglePopup} title="Manage assistants">
            {#if active}
                <span class="aa-emoji">{active.emoji}</span>
                <span class="aa-info">
                    <span class="aa-name">{active.name}</span>
                    {#if active.description}<span class="aa-desc"
                            >{active.description}</span
                        >{/if}
                </span>
            {:else}
                <span class="aa-name">No assistant</span>
            {/if}
            <Icon name="chevron-right" size={16} class="aa-chev" />
        </button>
    </div>

    <!-- Chats (scoped to the active assistant; stable - never pushed by assistant count). -->
    <div class="convos">
        <div class="convos-head">
            <span class="convos-label">Chats</span>
            <button
                class="btn btn-ghost btn-sm"
                onclick={() => {
                    chat.newConversation();
                    onNavigateToChat();
                }}
            >
                <Icon name="plus" size={14} /> New
            </button>
        </div>
        <div class="convos-list">
            {#each chat.conversations as conv (conv.id)}
                <button
                    class="convo"
                    class:active={conv.id === chat.activeId}
                    onclick={() => {
                        chat.open(conv.id);
                        onNavigateToChat();
                    }}
                >
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
{#if popupOpen}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-backdrop" onclick={closePopup} onkeydown={() => {}}>
        <div class="modal-card" onclick={(e) => e.stopPropagation()}>
            <Switcher
                onClose={closePopup}
                onEdit={(id) => {
                    closePopup();
                    onEditAssistant(id);
                }}
            />
        </div>
    </div>
{/if}
<style>
.aa-wrap {
    flex: none;
}
.modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--overlay);
    backdrop-filter: blur(var(--overlay-blur));
}
.modal-card {
    width: min(640px, 90vw);
    max-height: min(720px, 80vh);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    box-shadow: var(--shadow-lg);
}
.aa-card {
    flex: none;
    display: flex;
    align-items: center;
    gap: 0.55rem;
    width: 100%;
    text-align: start;
    padding: 0.85rem 0.95rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    box-shadow: var(--shadow);
    color: var(--text);
    transition:
        border-color var(--transition),
        box-shadow var(--transition);
}
.aa-card:hover {
    border-color: var(--border-strong);
    box-shadow: var(--shadow-lg);
}
.aa-emoji {
    font-size: 1.375rem;
    line-height: 1;
    flex-shrink: 0;
}
.aa-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
    gap: 0.1rem;
}
.aa-name {
    font-size: var(--t-sm);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.aa-desc {
    font-size: var(--t-2xs);
    color: var(--text-faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.aa-chev {
    color: var(--text-faint);
    flex-shrink: 0;
    transition: transform var(--transition);
}
.convos {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
}
.convos-head {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 0 0.3rem;
}
.convos-label {
    font-size: var(--t-3xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-faint);
}
.convos-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0.15rem 0 0.3rem;
}
.convo {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    width: 100%;
    text-align: start;
    padding: 0.5rem 0.6rem;
    border-radius: var(--r);
    color: var(--text-muted);
    font-size: var(--t-xs);
    transition:
        background var(--transition),
        color var(--transition);
}
.convo:hover {
    background: var(--surface-3);
    color: var(--text);
}
.convo.active {
    background: var(--primary-soft);
    color: var(--primary);
    font-weight: 600;
}
.convo .dot {
    background: var(--text-faint);
}
.convo.active .dot {
    background: var(--primary);
}
.convo .t {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.side-footer {
    flex: none;
}
.side-foot-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.6rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    box-shadow: var(--shadow);
    color: var(--text-muted);
    font-size: var(--t-xs);
    transition:
        border-color var(--transition),
        box-shadow var(--transition),
        color var(--transition);
}
.side-foot-btn:hover {
    border-color: var(--border-strong);
    box-shadow: var(--shadow-lg);
    color: var(--text);
}
</style>
