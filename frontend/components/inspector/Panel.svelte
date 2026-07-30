<script lang="ts">
import { chat } from "$lib/chat.svelte";
import NetworkLogDetail from "./Detail.svelte";
import type { NetworkLog } from "$shared/chat-events.ts";
import Icon from "$components/ui/Icon.svelte";

let { onClose }: { onClose: () => void } = $props();
let selectedId = $state<string | null>(null);
const selected = $derived(
    chat.networkLogs.find((l) => l.id === selectedId) ?? null,
);

function modelOf(log: NetworkLog): string {
    const body = log.request.body as { model?: string } | null;
    return body?.model ?? log.request.url;
}
</script>

<aside class="inspector">
    <header class="pane-head">
        <span class="title">Network <span class="count">({chat.networkLogs.length})</span></span>
        <div class="head-actions">
            <button class="btn btn-ghost btn-sm" onclick={() => chat.clearLogs()}>Clear</button>
            <button class="btn btn-icon btn-sm" onclick={onClose} aria-label="Close inspector">
                <Icon name="x" size={16} />
            </button>
        </div>
    </header>
    <div class="master">
        {#each chat.networkLogs as log (log.id)}
            <button
                class="row"
                class:active={log.id === selectedId}
                onclick={() => (selectedId = log.id)}
            >
                <span class="dot" data-status={log.status}></span>
                <span class="model">{modelOf(log)}</span>
                <span class="dur">{log.durationMs != null ? `${log.durationMs}ms` : "…"}</span>
            </button>
        {:else}
            <div class="empty">No requests yet…</div>
        {/each}
    </div>
    {#if selected}
        <NetworkLogDetail log={selected} />
    {/if}
</aside>
<style>
    .inspector {
        display: flex;
        flex-direction: column;
        background: var(--surface);
        height: 100%;
        min-height: 0;
    }
    .inspector :global(.count) {
        color: var(--text-faint);
        font-weight: 400;
    }
    .master {
        max-height: 42%;
        overflow-y: auto;
        border-bottom: 1px solid var(--border);
    }
    .row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        width: 100%;
        text-align: start;
        padding: 0.45rem 0.7rem;
        border-bottom: 1px solid var(--border);
        border-inline-start: 2px solid transparent;
        font-size: 0.75rem;
    }
    .row:hover {
        background: var(--surface-2);
    }
    .row.active {
        background: var(--primary-soft);
        border-inline-start-color: var(--primary);
    }
    .row :global(.dot[data-status="success"]) {
        background: var(--ok);
    }
    .row :global(.dot[data-status="error"]) {
        background: var(--danger);
    }
    .row :global(.dot[data-status="streaming"]),
    .row :global(.dot[data-status="running"]) {
        background: var(--warn);
    }
    .row :global(.dot[data-status="pending"]) {
        background: var(--text-faint);
    }
    .model {
        font-family: var(--mono);
        font-size: 0.75rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .dur {
        margin-inline-start: auto;
        color: var(--text-faint);
        font-size: 0.6875rem;
        flex-shrink: 0;
    }
</style>
