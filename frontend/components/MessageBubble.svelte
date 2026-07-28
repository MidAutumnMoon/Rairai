<script lang="ts">
    import type { ChatMessage } from "../../shared/chat-events.ts";
    import { chat } from "../lib/chat.svelte";
    import { renderMarkdown } from "../lib/markdown";
    import ReasoningBlock from "./ReasoningBlock.svelte";
    import ToolCallCard from "./ToolCallCard.svelte";

    let { msg }: { msg: ChatMessage } = $props();

    let copied = $state(false);

    const isStreaming = $derived(chat.streamingMessageId === msg.id);
    // Render markdown only for finalized messages; while streaming we show raw
    // text to avoid re-parsing markdown on every token.
    const html = $derived(isStreaming ? "" : renderMarkdown(msg.text));

    async function copy() {
        try {
            await navigator.clipboard.writeText(msg.text);
            copied = true;
            setTimeout(() => (copied = false), 1200);
        } catch {
            // clipboard unavailable
        }
    }
</script>

<article class="bubble" class:user={msg.role === "user"}>
    <div class="role">{msg.role}{msg.model ? ` · ${msg.model}` : ""}</div>

    {#if msg.reasoning}
        <ReasoningBlock text={msg.reasoning} streaming={isStreaming} />
    {/if}

    {#if msg.toolCalls && msg.toolCalls.length}
        <div class="tools">
            {#each msg.toolCalls as tc (tc.id)}
                <ToolCallCard toolCall={tc} />
            {/each}
        </div>
    {/if}

    <div class="content">
        {#if isStreaming}
            <pre class="raw">{msg.text || "…"}</pre>
        {:else if msg.text}
            {@html html}
        {/if}
    </div>

    {#if !isStreaming}
        <footer class="meta">
            {#if msg.text}
                <button class="ghost" onclick={copy}>{copied ? "copied" : "copy"}</button>
            {/if}
            {#if msg.usage}
                <span class="tokens">
                    {msg.usage.input}<span class="arrow">↑</span>{msg.usage.output}<span class="arrow">↓</span>
                </span>
            {/if}
            {#if msg.durationMs != null}
                <span class="dur">{(msg.durationMs / 1000).toFixed(1)}s</span>
            {/if}
        </footer>
    {/if}
</article>

<style>
    .bubble {
        padding: 0.9rem 1.1rem;
        border-bottom: 1px solid var(--border-soft);
    }
    .bubble.user {
        background: rgba(79, 156, 255, 0.04);
    }
    .role {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-faint);
        margin-bottom: 0.4rem;
    }
    .content {
        font-size: 14px;
        line-height: 1.6;
    }
    .content :global(p) {
        margin: 0.4rem 0;
    }
    .content :global(p:first-child) {
        margin-top: 0;
    }
    .content :global(p:last-child) {
        margin-bottom: 0;
    }
    .content :global(pre) {
        background: var(--bg);
        border: 1px solid var(--border-soft);
        border-radius: 6px;
        padding: 0.7rem;
        overflow-x: auto;
        font-size: 13px;
        margin: 0.5rem 0;
    }
    .content :global(code) {
        font-family: var(--mono);
        font-size: 13px;
    }
    .content :global(:not(pre) > code) {
        background: var(--bg-elev2);
        padding: 0.05rem 0.3rem;
        border-radius: 3px;
    }
    .content :global(a) {
        color: var(--accent);
    }
    .content :global(ul),
    .content :global(ol) {
        padding-left: 1.4rem;
        margin: 0.4rem 0;
    }
    .content :global(table) {
        border-collapse: collapse;
        margin: 0.5rem 0;
    }
    .content :global(th),
    .content :global(td) {
        border: 1px solid var(--border-soft);
        padding: 0.3rem 0.6rem;
    }
    .raw {
        color: var(--text);
        font-size: 14px;
    }
    .tools {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        margin: 0.5rem 0;
    }
    .meta {
        display: flex;
        align-items: center;
        gap: 0.7rem;
        margin-top: 0.5rem;
        font-size: 11px;
        color: var(--text-faint);
    }
    .ghost {
        color: var(--text-faint);
        padding: 0.1rem 0.35rem;
        border-radius: 3px;
        font-size: 11px;
    }
    .ghost:hover {
        color: var(--text);
    }
    .arrow {
        margin: 0 0.1rem 0 0.15rem;
        opacity: 0.7;
    }
</style>
