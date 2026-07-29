<script lang="ts">
// A provider's model list, grouped by maker, with a Fetch-from-API action.
// Extracted from Providers.svelte to flatten the detail pane: the nested
// {#each group}{#each model} lived inline, compounding the indentation.
import type { Model, Provider } from "$shared/api.ts";
import Icon from "$components/ui/Icon.svelte";

let {
    provider,
    fetching = false,
    onfetch,
    onremove,
}: {
    provider: Provider;
    fetching?: boolean;
    onfetch: () => void;
    onremove: (modelId: string) => void;
} = $props();

function groupedModels(models: Model[]): { group: string; models: Model[] }[] {
    const out: { group: string; models: Model[] }[] = [];
    const seen = new Map<string, number>();
    for (const m of models) {
        const idx = seen.get(m.group);
        if (idx === undefined) {
            seen.set(m.group, out.length);
            out.push({ group: m.group, models: [m] });
        } else {
            out[idx].models.push(m);
        }
    }
    return out;
}
</script>

<section class="field-group">
    <div class="field-group-head">
        <h3 class="field-group-title">
            Models
            <span class="hint">{provider.models.length}</span>
        </h3>
        <span class="grow"></span>
        <button
            class="btn btn-sm"
            onclick={onfetch}
            disabled={fetching || provider.apiType === "faux"}
            title={provider.apiType === "faux"
                ? "Faux providers have no API to fetch from"
                : "Pull model list from the provider's API"}
        >
            {fetching ? "Fetching…" : "Fetch from API"}
        </button>
    </div>
    {#if provider.models.length === 0}
        <div class="empty-sm">
            No models. Click "Fetch from API" to pull the list from the provider.
        </div>
    {:else}
        {#each groupedModels(provider.models) as g (g.group)}
            <div class="model-group">
                <div class="model-group-head">{g.group}</div>
                <div class="model-list">
                    {#each g.models as m (m.id)}
                        <div class="model-row">
                            <span class="model-name" title={m.id}>{m.name}</span>
                            <span class="model-id">{m.id}</span>
                            <button
                                class="btn btn-icon btn-sm danger"
                                onclick={() => onremove(m.id)}
                                title="Remove model"
                            >
                                <Icon name="x" size={13} />
                            </button>
                        </div>
                    {/each}
                </div>
            </div>
        {/each}
    {/if}
</section>
