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
