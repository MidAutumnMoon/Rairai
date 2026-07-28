<script lang="ts">
    import { Collapsible } from "bits-ui";
    import type { ToolCall } from "../../shared/chat-events.ts";

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
