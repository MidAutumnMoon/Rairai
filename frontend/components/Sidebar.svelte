<script lang="ts">
    import { chat } from "../lib/chat.svelte";
</script>

<aside class="sidebar">
    <header class="pane-head">
        <span class="brand">Rairai</span>
        <button class="new" onclick={() => chat.newConversation()}>+ New</button>
    </header>
    <div class="convos">
        {#each chat.conversations as conv (conv.id)}
            <button
                class="convo"
                class:active={conv.id === chat.activeId}
                onclick={() => chat.select(conv.id)}
            >
                <span class="dot"></span>
                <span class="t">{conv.title}</span>
            </button>
        {/each}
    </div>
</aside>

<style>
    .sidebar {
        display: flex;
        flex-direction: column;
        background: var(--bg-elev);
        min-height: 0;
    }
    .brand {
        font-weight: 700;
        letter-spacing: 0.02em;
    }
    .new {
        background: var(--bg-elev2);
        border: 1px solid var(--border);
        border-radius: 4px;
        padding: 0.2rem 0.5rem;
        font-size: 12px;
    }
    .new:hover {
        border-color: var(--accent);
    }
    .convos {
        flex: 1;
        overflow-y: auto;
        padding: 0.4rem;
    }
    .convo {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        width: 100%;
        text-align: left;
        padding: 0.5rem 0.55rem;
        border-radius: 6px;
        color: var(--text-dim);
    }
    .convo:hover {
        background: var(--bg-elev2);
        color: var(--text);
    }
    .convo.active {
        background: var(--bg-elev2);
        color: var(--text);
    }
    .convo .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--text-faint);
        flex-shrink: 0;
    }
    .convo.active .dot {
        background: var(--accent);
    }
    .convo .t {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
</style>
