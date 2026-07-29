<script lang="ts">
// One prompt block in the assistant editor. Extracted from Editor.svelte
// because the {#each} body was the deepest nesting in the file (5-6 levels:
// each -> if/else -> toggle -> actions -> textarea). The per-item renderer
// belongs in its own file; the editor just maps over blocks.
import type { PromptBlock, PromptRole } from "$shared/api.ts";
import Icon from "$components/ui/Icon.svelte";

let {
    block,
    index,
    first,
    last,
    roleOptions,
    ontoggle,
    onpatch,
    onmove,
    onremove,
}: {
    block: PromptBlock;
    index: number;
    first: boolean;
    last: boolean;
    roleOptions: { value: PromptRole; label: string }[];
    ontoggle: (id: string) => void;
    onpatch: (id: string, patch: Partial<PromptBlock>) => void;
    onmove: (i: number, dir: -1 | 1) => void;
    onremove: (i: number) => void;
} = $props();

const placeholder = $derived(
    block.role === "system"
        ? "System instructions…"
        : block.role === "user"
        ? "User example…"
        : "Assistant example…",
);
</script>

<div class="pblock" class:disabled={!block.enabled}>
    <div class="pblock-head">
        {#if block.role === "history"}
            <span class="pblock-marker">⌖ History insertion point</span>
        {:else}
            <button
                type="button"
                class="pblock-toggle"
                data-state={block.enabled ? "on" : "off"}
                title={block.enabled ? "Enabled" : "Disabled"}
                onclick={() => ontoggle(block.id)}
            >
                <Icon name={block.enabled ? "check" : "x"} size={15} />
            </button>
            <select
                class="pblock-role"
                value={block.role}
                onchange={(e) =>
                    onpatch(block.id, {
                        role: (e.currentTarget as HTMLSelectElement).value as PromptRole,
                    })}
            >
                {#each roleOptions as r (r.value)}
                    <option value={r.value}>{r.label}</option>
                {/each}
            </select>
            <input class="pblock-name" bind:value={block.name} placeholder="block name" />
        {/if}
        <div class="pblock-actions">
            <button
                type="button"
                class="btn btn-icon btn-sm"
                onclick={() => onmove(index, -1)}
                disabled={first}
                title="Move up"
            >
                <Icon name="chevron-up" size={15} />
            </button>
            <button
                type="button"
                class="btn btn-icon btn-sm"
                onclick={() => onmove(index, 1)}
                disabled={last}
                title="Move down"
            >
                <Icon name="chevron-down" size={15} />
            </button>
            <button
                type="button"
                class="btn btn-icon btn-sm danger"
                onclick={() => onremove(index)}
                title="Delete block"
            >
                <Icon name="trash" size={15} />
            </button>
        </div>
    </div>
    {#if block.role !== "history"}
        <textarea class="pblock-content" bind:value={block.content} {placeholder}></textarea>
    {/if}
</div>
