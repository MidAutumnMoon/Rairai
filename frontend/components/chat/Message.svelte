<script lang="ts">
import type { ChatMessage } from "$shared/chat-events.ts";
import { chat } from "$lib/chat.svelte";
import { renderMarkdown } from "$lib/markdown";
import ReasoningBlock from "./Reasoning.svelte";
import ToolCallCard from "./ToolCall.svelte";
import Icon from "$components/ui/Icon.svelte";
import Button from "$components/ui/Button.svelte";

let { msg }: { msg: ChatMessage } = $props();

let copied = $state(false);

const isStreaming = $derived(chat.streamingMessageId === msg.id);
// Render markdown only for finalized messages; while streaming we show raw
// text to avoid re-parsing markdown on every token.
const html = $derived(isStreaming ? "" : renderMarkdown(msg.text));
const isAssistant = $derived(msg.role === "assistant");

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

<article class="msg" class:assistant={isAssistant} class:user={!isAssistant}>
    {#if isAssistant}
        <header class="msg-head">
            <span class="msg-avatar assistant">
                <Icon name="sparkles" size={15} />
            </span>
            <span class="msg-name">Assistant</span>
            {#if msg.model}
                <span class="msg-model">{msg.model}</span>
            {/if}
        </header>
    {/if}

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

    <div class="msg-body" class:bubble={!isAssistant}>
        {#if isStreaming}
            <pre class="raw">{msg.text || "…"}</pre>
        {:else}
            <div class="prose">{@html html}</div>
        {/if}
    </div>

    {#if !isStreaming}
        <footer class="msg-footer">
            {#if msg.text}
                <Button label="Copy" class="btn btn-ghost btn-sm" onclick={copy}>
                    <Icon name={copied ? "check" : "copy"} size={14} />
                </Button>
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
.msg {
    max-width: var(--content-w);
    margin: 0 auto;
    padding: 0.75rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}
.msg-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}
.msg-avatar {
    width: 26px;
    height: 26px;
    border-radius: var(--r-full);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}
.msg-avatar.assistant {
    background: var(--primary-soft);
    color: var(--primary);
}
.msg-name {
    font-weight: 600;
    font-size: var(--t-xs);
}
.msg-model {
    font-size: var(--t-3xs);
    color: var(--text-faint);
    font-family: var(--mono);
}
.msg-body {
    font-size: var(--t-base);
    line-height: 1.65;
}
.msg-body .raw {
    white-space: pre-wrap;
    word-break: break-word;
    font-family: var(--mono);
    font-size: var(--t-xs);
    color: var(--text-muted);
}

/* User message: a right-aligned light-blue bubble (DeepSeek-style "sent").
   align-self:flex-end pins it right AND keeps it content-sized so it
   doesn't stretch full-width; max-width caps long messages. */
.msg.user .bubble {
    align-self: flex-end;
    max-width: 80%;
    background: var(--primary-soft);
    color: var(--text);
    border-radius: 1.1rem;
    padding: 0.55rem 0.9rem;
    box-shadow: var(--shadow-sm);
}
/* .prose is {@html}-injected (no scope hash, like the global prose.css),
   so reach its children with :global and keep code/links legible on the
   light blue field. */
.msg.user .bubble :global(.prose code) {
    background: rgba(0, 0, 0, 0.08);
    color: var(--text);
}
.msg.user .bubble :global(.prose pre) {
    background: rgba(0, 0, 0, 0.1);
    border-color: rgba(0, 0, 0, 0.12);
}
.msg.user .bubble :global(.prose pre code) {
    color: var(--text);
}
.msg.user .bubble :global(.prose a) {
    color: var(--primary);
    text-decoration: underline;
}
.msg.user .msg-footer {
    align-self: flex-end;
}

.msg-footer {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: var(--t-3xs);
    color: var(--text-faint);
    opacity: 0;
    transition: opacity var(--transition);
}
.msg:hover .msg-footer {
    opacity: 1;
}
.tools {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}
.tokens .arrow {
    opacity: 0.6;
    margin-inline: 0.15rem;
}
</style>
