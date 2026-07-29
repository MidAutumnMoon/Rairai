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
