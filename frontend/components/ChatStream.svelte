<script lang="ts">
    import { tick } from "svelte";
    import { chat } from "../lib/chat.svelte";
    import MessageBubble from "./MessageBubble.svelte";

    let container: HTMLDivElement | undefined = $state();
    let stickToBottom = true;
    let loadingOlder = false;
    let lastConvId: string | null = null;

    // Auto-scroll to the bottom as content streams in, but only when the user is
    // parked at the bottom - so scrolling up to read doesn't get yanked back.
    $effect(() => {
        const conv = chat.active;
        if (!conv || !container) return;
        if (conv.id !== lastConvId) {
            lastConvId = conv.id;
            stickToBottom = true;
        }
        const last = conv.messages[conv.messages.length - 1];
        void last?.text; // track streaming text (re-runs this effect)
        void last?.reasoning;
        if (stickToBottom) container.scrollTop = container.scrollHeight;
    });

    async function onScroll() {
        const el = container;
        const conv = chat.active;
        if (!el || !conv) return;
        stickToBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 48;
        // Near the top + more to load -> fetch an older page.
        if (el.scrollTop < 60 && conv.hasMore && conv.oldestSeq != null && !loadingOlder) {
            loadingOlder = true;
            const prevHeight = el.scrollHeight;
            await chat.loadOlder();
            await tick();
            // Anchor the view to the old top: prepended older messages go above
            // without moving the message the user is reading.
            el.scrollTop = el.scrollHeight - prevHeight;
            loadingOlder = false;
        }
    }
</script>

<div class="stream" bind:this={container} onscroll={onScroll}>
    {#if chat.active?.hasMore}
        <div class="load-more">{loadingOlder ? "Loading older…" : "↑ older messages"}</div>
    {/if}
    {#if chat.active && chat.active.messages.length}
        {#each chat.active.messages as msg (msg.id)}
            <MessageBubble {msg} />
        {/each}
    {:else}
        <div class="empty">
            <p>Send a message to begin.</p>
        </div>
    {/if}
    {#if chat.streamError}
        <div class="error-banner">⚠ {chat.streamError}</div>
    {/if}
</div>

<style>
    .stream {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 1rem 0;
    }
    .load-more {
        text-align: center;
        color: var(--text-faint);
        font-size: 12px;
        padding: 0.4rem;
    }
    .empty {
        color: var(--text-faint);
        text-align: center;
        margin-top: 3rem;
        padding: 0 1.5rem;
    }
    .error-banner {
        margin: 0.5rem 1rem;
        padding: 0.5rem 0.75rem;
        background: rgba(248, 113, 113, 0.1);
        border: 1px solid var(--err);
        border-radius: 6px;
        color: var(--err);
        font-size: 13px;
    }
</style>
