<script lang="ts">
    import { chat } from "../lib/chat.svelte";
    import MessageBubble from "./MessageBubble.svelte";

    let container: HTMLDivElement | undefined = $state();

    // Auto-scroll as content streams in. Re-runs when the active conversation's
    // message count or the streaming message's text changes.
    $effect(() => {
        const conv = chat.active;
        if (!conv) return;
        const n = conv.messages.length;
        const last = conv.messages[n - 1];
        const streamingText = last ? last.text.length + (last.reasoning?.length ?? 0) : 0;
        void streamingText; // track for re-run
        if (container) container.scrollTop = container.scrollHeight;
    });
</script>

<div class="stream" bind:this={container}>
    {#if chat.active && chat.active.messages.length}
        {#each chat.active.messages as msg (msg.id)}
            <MessageBubble {msg} />
        {/each}
    {:else}
        <div class="empty">
            <p>Send a message to begin.</p>
            <p class="hint">
                The backend defaults to the <code>faux</code> provider (no API key needed).
                Set <code>OPENAI_BASE_URL</code> + <code>OPENAI_API_KEY</code> to use a real
                OpenAI-compatible endpoint.
            </p>
        </div>
    {/if}
    {#if chat.streamError}
        <div class="error-banner">⚠ {chat.streamError}</div>
    {/if}
</div>

<style>
    .stream {
        flex: 1;
        overflow-y: auto;
        padding: 1rem 0;
    }
    .empty {
        color: var(--text-faint);
        text-align: center;
        margin-top: 3rem;
        padding: 0 1.5rem;
    }
    .empty .hint {
        font-size: 12px;
        margin-top: 1rem;
        line-height: 1.6;
    }
    .empty code {
        background: var(--bg-elev2);
        padding: 0.05rem 0.3rem;
        border-radius: 3px;
        font-family: var(--mono);
        font-size: 11px;
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
