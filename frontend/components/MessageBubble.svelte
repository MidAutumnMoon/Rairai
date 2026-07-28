<script lang="ts">
    import type { ChatMessage } from "../../shared/chat-events.ts";
    import { chat } from "../lib/chat.svelte";
    import { renderMarkdown } from "../lib/markdown";
    import ReasoningBlock from "./ReasoningBlock.svelte";
    import ToolCallCard from "./ToolCallCard.svelte";
    import Icon from "./ui/Icon.svelte";
    import Tooltip from "./ui/Tooltip.svelte";

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
        {:else}
            <div class="prose">{@html html}</div>
        {/if}
    </div>

    {#if !isStreaming}
        <footer class="meta">
            {#if msg.text}
                <Tooltip label="Copy" class="btn btn-ghost btn-sm" onclick={copy}>
                    <Icon name={copied ? "check" : "copy"} />
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
