<script lang="ts">
    import { chat } from "../lib/chat.svelte";
    import NetworkLogDetail from "./NetworkLogDetail.svelte";
    import type { NetworkLog } from "../../shared/chat-events.ts";

    let selectedId = $state<string | null>(null);
    const selected = $derived(chat.networkLogs.find((l) => l.id === selectedId) ?? null);

    function modelOf(log: NetworkLog): string {
        const body = log.request.body as { model?: string } | null;
        return body?.model ?? log.request.url;
    }
</script>

<aside class="inspector">
    <header class="pane-head">
        <span class="title">Network <span class="count">({chat.networkLogs.length})</span></span>
        <button onclick={() => chat.clearLogs()}>Clear</button>
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
            <div class="empty">No requests yet. Send a message to see LLM calls here.</div>
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
        background: var(--bg-elev);
        min-height: 0;
    }
    .count {
        color: var(--text-faint);
        font-weight: 400;
    }
    .master {
        max-height: 40%;
        overflow-y: auto;
        border-bottom: 1px solid var(--border);
    }
    .row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        width: 100%;
        text-align: left;
        padding: 0.4rem 0.7rem;
        border-bottom: 1px solid var(--border-soft);
        font-size: 12px;
    }
    .row:hover {
        background: var(--bg-elev2);
    }
    .row.active {
        background: var(--bg-elev2);
        border-left: 2px solid var(--accent);
        padding-left: calc(0.7rem - 2px);
    }
    .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        flex-shrink: 0;
    }
    .dot[data-status="success"] {
        background: var(--ok);
    }
    .dot[data-status="error"] {
        background: var(--err);
    }
    .dot[data-status="streaming"] {
        background: var(--warn);
    }
    .dot[data-status="pending"] {
        background: var(--text-faint);
    }
    .model {
        font-family: var(--mono);
        font-size: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .dur {
        margin-left: auto;
        color: var(--text-faint);
        font-size: 11px;
        flex-shrink: 0;
    }
    .empty {
        padding: 1rem 0.7rem;
        color: var(--text-faint);
        font-size: 12px;
    }
</style>
