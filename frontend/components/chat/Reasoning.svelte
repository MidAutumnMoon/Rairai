<script lang="ts">
import { Collapsible } from "bits-ui";
import Sparkles from "@lucide/svelte/icons/sparkles";
import ChevronRight from "@lucide/svelte/icons/chevron-right";
import { renderMarkdown } from "$lib/markdown";

let { text, streaming = false }: { text: string; streaming?: boolean } =
    $props();

let open = $state(false);
// Auto-expand while reasoning streams in; let the user collapse afterwards.
$effect(() => {
    if (streaming) open = true;
});

const html = $derived(streaming ? "" : renderMarkdown(text));
</script>

<Collapsible.Root bind:open class="reasoning">
    <Collapsible.Trigger class="collapse-trigger">
        <Sparkles size={13} class="reasoning-icon" />
        <span>Reasoning</span>
        <ChevronRight size={13} class="chev" />
    </Collapsible.Trigger>
    <Collapsible.Content class="collapse-content">
        {#if streaming}
            <pre class="raw">{text}</pre>
        {:else}
            <div class="prose">{@html html}</div>
        {/if}
    </Collapsible.Content>
</Collapsible.Root>

<style>
/* :global - Collapsible.Root/Trigger/Content render inside bits-ui's own
   scope, so scoped selectors here never attach the svelte-XXXX hash. The
   shared .collapse-trigger/.collapse-content base lives in bits-ui.css; we
   override it scoped to .reasoning so ToolCall keeps its card look. */

/* Collapsed: no card chrome - just a quiet metadata line. No border, no
   amber fill; transparent so it fades into the message when scanning. */
:global(.reasoning) {
    border: 0;
    background: transparent;
    border-radius: 0;
    overflow: visible;
}
/* Trigger: shrink the shared full-width padded bar to a small inline line.
   Same color family as the assistant name/timestamp (--text-faint) so it
   reads as metadata, not a button. */
:global(.reasoning .collapse-trigger) {
    width: auto;
    padding: 0.15rem 0;
    font-weight: 500;
    font-size: var(--t-2xs);
    color: var(--text-faint);
    gap: 0.3rem;
}
:global(.reasoning .collapse-trigger:hover) {
    color: var(--text-muted);
}
:global(.reasoning .reasoning-icon) {
    color: var(--text-faint);
    flex-shrink: 0;
}
/* Expanded: a compact, subordinate block - soft gray fill, smaller font,
   secondary text. Clearly readable but visually below the main answer. */
:global(.reasoning .collapse-content) {
    background: var(--surface-2);
    border-top: 0;
    border-radius: var(--r);
    padding: 0.6rem 0.75rem;
    margin-top: 0.3rem;
    font-size: var(--t-2xs);
    color: var(--text-muted);
    line-height: 1.55;
}
:global(.reasoning .collapse-content .raw) {
    white-space: pre-wrap;
    word-break: break-word;
    font-family: var(--mono);
    font-size: var(--t-2xs);
    color: var(--text-muted);
}
</style>
