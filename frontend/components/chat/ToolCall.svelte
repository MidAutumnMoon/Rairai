<script lang="ts">
import { Collapsible } from "bits-ui";
import type { ToolCall } from "$shared/chat-events.ts";

let { toolCall }: { toolCall: ToolCall } = $props();

let open = $state(false);
</script>

<Collapsible.Root bind:open class="tool">
    <Collapsible.Trigger class="collapse-trigger">
        <div class="tool-head">
            <span
                class="dot"
                data-status={toolCall.status}
                class:spin={toolCall.status === "running"}
            ></span>
            <span class="tool-name">{toolCall.name}</span>
            <span class="tool-status">{toolCall.status}</span>
            {#if toolCall.durationMs != null}
                <span class="tool-dur">{toolCall.durationMs}ms</span>
            {/if}
        </div>
    </Collapsible.Trigger>
    <Collapsible.Content class="tool-detail">
        <span class="k">args</span>
        <pre class="v">{toolCall.args}</pre>
        {#if toolCall.result != null}
            <span class="k">result</span>
            <pre class="v" class:err={toolCall.status === "error"}>{toolCall.result}</pre>
        {/if}
    </Collapsible.Content>
</Collapsible.Root>

<style>
    .tool {
        border: 1px solid var(--border);
        border-radius: var(--r);
        background: var(--surface);
        overflow: hidden;
    }
    .tool-head {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        width: 100%;
    }
    .tool-name {
        font-weight: 600;
        font-size: 13px;
    }
    .tool-status {
        font-size: 11px;
        color: var(--text-faint);
        text-transform: capitalize;
    }
    .tool-dur {
        margin-inline-start: auto;
        color: var(--text-faint);
        font-size: 11px;
    }
    .tool :global(.spin) {
        animation: spin 0.8s linear infinite;
    }
    .tool-detail {
        padding: 0.5rem 0.7rem 0.6rem;
        border-top: 1px solid var(--border);
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
    }
    .tool-detail .k {
        font-size: 11px;
        font-weight: 600;
        color: var(--text-faint);
        text-transform: uppercase;
        letter-spacing: 0.03em;
    }
    .tool-detail .v {
        background: var(--surface-2);
        border-radius: var(--r-sm);
        padding: 0.4rem 0.55rem;
        overflow-x: auto;
    }
    .tool-detail .v.err {
        color: var(--danger);
    }
    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }
</style>
