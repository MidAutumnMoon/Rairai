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

<style>
    .pblock {
        border: 1px solid var(--border);
        border-radius: var(--r-md);
        overflow: hidden;
        background: var(--surface);
    }
    .pblock.disabled {
        opacity: 0.6;
        border-style: dashed;
    }
    .pblock-head {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.4rem 0.55rem;
        background: var(--surface-2);
        border-bottom: 1px solid var(--border);
    }
    .pblock-marker {
        flex: 1;
        font-size: 12px;
        font-weight: 700;
        color: var(--warn);
    }
    .pblock-toggle {
        display: inline-flex;
        color: var(--text-faint);
    }
    .pblock-toggle[data-state="on"] {
        color: var(--ok);
    }
    .pblock-role {
        font-size: 11px;
        font-weight: 600;
        color: var(--text-muted);
        background: transparent;
        border: 0;
        border-bottom: 1px dashed var(--border-strong);
        border-radius: 0;
        padding: 0 0.2rem 0 0;
        cursor: pointer;
        outline: none;
    }
    .pblock-name {
        flex: 1;
        min-width: 0;
        border: 0;
        background: transparent;
        font-size: 12px;
        color: var(--text-muted);
        outline: none;
        border-bottom: 1px dashed transparent;
    }
    .pblock-name:focus {
        border-bottom-color: var(--primary);
    }
    .pblock-actions {
        display: flex;
        gap: 0.1rem;
    }
    .pblock-actions .btn-icon {
        width: 26px;
        height: 26px;
        color: var(--text-faint);
    }
    .pblock-actions .btn-icon:hover {
        color: var(--text);
    }
    .pblock-actions .btn-icon.danger:hover {
        color: var(--danger);
    }
    .pblock-content {
        width: 100%;
        border: 0;
        background: transparent;
        resize: vertical;
        outline: none;
        padding: 0.55rem 0.65rem;
        font-family: var(--mono);
        font-size: 12.5px;
        line-height: 1.5;
        min-height: 70px;
        color: var(--text);
    }
</style>
