<script lang="ts">
    import { renderMarkdown } from "../lib/markdown";

    let { text, streaming = false }: { text: string; streaming?: boolean } = $props();

    let open = $state(false);
    // Auto-expand while reasoning streams in; let the user collapse afterwards.
    $effect(() => {
        if (streaming) open = true;
    });

    const html = $derived(streaming ? "" : renderMarkdown(text));
</script>

<div class="reasoning">
    <button class="toggle" onclick={() => (open = !open)}>
        <span class="chev">{open ? "▾" : "▸"}</span>
        <span class="label">Reasoning</span>
    </button>
    {#if open}
        <div class="body">
            {#if streaming}
                <pre class="raw">{text}</pre>
            {:else}
                {@html html}
            {/if}
        </div>
    {/if}
</div>

<style>
    .reasoning {
        margin: 0 0 0.6rem;
        border: 1px solid var(--border-soft);
        border-radius: 6px;
        background: rgba(251, 191, 36, 0.03);
        overflow: hidden;
    }
    .toggle {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        width: 100%;
        text-align: left;
        padding: 0.35rem 0.6rem;
        font-size: 12px;
        color: var(--warn);
    }
    .chev {
        font-size: 10px;
    }
    .body {
        padding: 0.5rem 0.7rem 0.6rem;
        border-top: 1px solid var(--border-soft);
        font-size: 13px;
        color: var(--text-dim);
        line-height: 1.55;
    }
    .raw {
        white-space: pre-wrap;
        word-break: break-word;
    }
</style>
