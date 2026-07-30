<script lang="ts">
import { Collapsible } from "bits-ui";
import Icon from "$components/ui/Icon.svelte";
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
        <Icon name="chevron-right" class="chev" />
        <span>Reasoning</span>
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
/* :global — Collapsible.Root renders the .reasoning element inside
   bits-ui's own scope, so a scoped selector here never attaches the
   svelte-XXXX hash and these rules silently no-op (the warn-soft fill
   and amber trigger never applied). Pierce the boundary. */
:global(.reasoning) {
    border: 1px solid var(--border);
    border-radius: var(--r);
    background: var(--warn-soft);
    border-color: color-mix(in oklch, var(--warn), white 60%);
    overflow: hidden;
}
:global(.reasoning .collapse-trigger) {
    color: oklch(48% 0.1 70);
}
</style>
