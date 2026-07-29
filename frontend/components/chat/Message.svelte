<script lang="ts">
import type { ChatMessage } from "$shared/chat-events.ts";
import { chat } from "$lib/chat.svelte";
import { renderMarkdown } from "$lib/markdown";
import ReasoningBlock from "./Reasoning.svelte";
import ToolCallCard from "./ToolCall.svelte";
import Icon from "$components/ui/Icon.svelte";
import Tooltip from "$components/ui/Tooltip.svelte";

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
    <header class="msg-head">
        <span class="msg-avatar {msg.role}">
            <Icon name={isAssistant ? "sparkles" : "user"} size={15} />
        </span>
        <span class="msg-name">{isAssistant ? "Assistant" : "You"}</span>
        {#if isAssistant && msg.model}
            <span class="msg-model">{msg.model}</span>
        {/if}
    </header>

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

    <div class="msg-body">
        {#if isStreaming}
            <pre class="raw">{msg.text || "…"}</pre>
        {:else}
            <div class="prose">{@html html}</div>
        {/if}
    </div>

    {#if !isStreaming}
        <footer class="msg-footer">
            {#if msg.text}
                <Tooltip label="Copy" class="btn btn-ghost btn-sm" onclick={copy}>
                    <Icon name={copied ? "check" : "copy"} size={14} />
                </Tooltip>
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
