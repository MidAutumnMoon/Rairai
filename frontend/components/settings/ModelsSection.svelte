<script lang="ts">
    // A provider's model list, grouped by maker, with a Fetch-from-API action.
    // Flat loop: group headers and model rows are sibling items in one {#each},
    // eliminating the nested group→list→row DOM and the double indentation it causes.
    import type { Model, Provider } from "$shared/api.ts";
    import X from "@lucide/svelte/icons/x";

    interface Props {
        provider: Provider;
        fetching?: boolean;
        onfetch: () => void;
        onremove: (modelId: string) => void;
    }

    let {
        provider,
        fetching = false,
        onfetch,
        onremove,
    }: Props = $props();

    type FlatItem =
        | { kind: "header"; group: string }
        | { kind: "model"; model: Model };

    function flatModels(models: Model[]): FlatItem[] {
        const items: FlatItem[] = [];
        const seen = new Set<string>();
        for (const m of models) {
            if (!seen.has(m.group)) {
                seen.add(m.group);
                items.push({ kind: "header", group: m.group });
            }
            items.push({ kind: "model", model: m });
        }
        return items;
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
            No models. Click "Fetch from API" to pull the list from the
            provider.
        </div>
    {:else}
        {#each flatModels(provider.models) as item}
            {#if item.kind === "header"}
                <div class="model-group-head">{item.group}</div>
            {:else}
                <div class="model-row">
                    <span class="model-name" title={item.model.id}>{item.model.name}</span>
                    <span class="model-id">{item.model.id}</span>
                    <button
                        class="btn btn-icon btn-sm danger"
                        onclick={() => onremove(item.model.id)}
                        title="Remove model"
                    >
                        <X size={13} />
                    </button>
                </div>
            {/if}
        {/each}
    {/if}
</section>

<style>
    .field-group-head {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .empty-sm {
        font-size: var(--t-2xs);
        color: var(--text-faint);
        padding: 0.4rem 0;
    }
    .model-group-head {
        font-size: var(--t-micro);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--text-faint);
        padding: 0.2rem 0;
        margin-top: 0.3rem;
    }
    .model-group-head:first-child {
        margin-top: 0;
    }
    .model-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.25rem 0.4rem;
        border-radius: var(--r-sm);
    }
    .model-row:hover {
        background: var(--surface-2);
    }
    .model-name {
        font-size: var(--t-xs);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .model-id {
        font-size: var(--t-3xs);
        font-family: var(--mono);
        color: var(--text-faint);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
        min-width: 0;
    }
</style>
