<script lang="ts">
    import type { ToolCall } from "../../shared/chat-events.ts";

    let { toolCall }: { toolCall: ToolCall } = $props();

    let expanded = $state(false);

    const dotColor = $derived(
        toolCall.status === "success"
            ? "var(--ok)"
            : toolCall.status === "error"
              ? "var(--err)"
              : toolCall.status === "running"
                ? "var(--warn)"
                : "var(--text-faint)",
    );
</script>

<div class="tool">
    <button class="head" onclick={() => (expanded = !expanded)}>
        <span class="dot" style:background={dotColor} class:spin={toolCall.status === "running"}></span>
        <span class="name">{toolCall.name}</span>
        <span class="status">{toolCall.status}</span>
        {#if toolCall.durationMs != null}<span class="dur">{toolCall.durationMs}ms</span>{/if}
    </button>
    {#if expanded}
        <div class="detail">
            <div class="kv">
                <span class="k">args</span>
                <pre class="v">{toolCall.args}</pre>
            </div>
            {#if toolCall.result != null}
                <div class="kv">
                    <span class="k">result</span>
                    <pre class="v" class:err={toolCall.status === "error"}>{toolCall.result}</pre>
                </div>
            {/if}
        </div>
    {/if}
</div>

<style>
    .tool {
        border: 1px solid var(--border-soft);
        border-radius: 6px;
        overflow: hidden;
    }
    .head {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        width: 100%;
        text-align: left;
        padding: 0.4rem 0.6rem;
        font-size: 12px;
    }
    .head:hover {
        background: var(--bg-elev2);
    }
    .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        flex-shrink: 0;
    }
    .dot.spin {
        animation: pulse 1s ease-in-out infinite;
    }
    @keyframes pulse {
        50% {
            opacity: 0.3;
        }
    }
    .name {
        font-family: var(--mono);
        font-size: 12px;
        color: var(--text);
    }
    .status {
        margin-left: auto;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--text-faint);
    }
    .dur {
        font-size: 11px;
        color: var(--text-faint);
    }
    .detail {
        border-top: 1px solid var(--border-soft);
        padding: 0.5rem 0.6rem;
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        background: var(--bg);
    }
    .kv {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
    }
    .k {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-faint);
    }
    .v {
        font-size: 12px;
        color: var(--text-dim);
    }
    .v.err {
        color: var(--err);
    }
</style>
