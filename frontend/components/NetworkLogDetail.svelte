<script lang="ts">
    import type { NetworkLog } from "../../shared/chat-events.ts";

    let { log }: { log: NetworkLog } = $props();

    // Recursive truncation (ported from IdoFront): tames large strings so base64
    // images etc. can't freeze the panel, while keeping the JSON valid.
    function truncate(value: unknown, depth = 0): unknown {
        if (depth > 10) return "…";
        if (typeof value === "string") {
            if (value.length > 1000) {
                return (
                    value.slice(0, 200) +
                    `\n…[truncated ${value.length - 400} chars]…\n` +
                    value.slice(-200)
                );
            }
            return value;
        }
        if (Array.isArray(value)) return value.map((v) => truncate(v, depth + 1));
        if (value && typeof value === "object") {
            return Object.fromEntries(
                Object.entries(value as Record<string, unknown>).map(([k, v]) => [
                    k,
                    truncate(v, depth + 1),
                ]),
            );
        }
        return value;
    }

    function fmt(value: unknown): string {
        try {
            return JSON.stringify(truncate(value), null, 2);
        } catch {
            return String(value);
        }
    }
</script>

<div class="detail">
    <section>
        <h4>Request</h4>
        <pre class="json">{fmt(log.request.body)}</pre>
    </section>
    {#if log.response}
        <section>
            <h4>Response · {log.response.status} {log.response.statusText}</h4>
            <pre class="json">{fmt(log.response.body)}</pre>
        </section>
        {#if log.response.streamChunks && log.response.streamChunks.length}
            <section>
                <h4>Stream · {log.response.streamChunks.length} chunks</h4>
                <pre class="chunks">{log.response.streamChunks.map((c) => c.data).join("")}</pre>
            </section>
        {/if}
    {/if}
    {#if log.error}
        <section>
            <h4>Error</h4>
            <pre class="json err">{log.error.message}</pre>
        </section>
    {/if}
</div>

<style>
    .detail {
        flex: 1;
        overflow-y: auto;
        padding: 0.6rem;
        display: flex;
        flex-direction: column;
        gap: 0.7rem;
    }
    h4 {
        margin: 0 0 0.3rem;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-faint);
    }
    .json {
        background: var(--bg);
        border: 1px solid var(--border-soft);
        border-radius: 5px;
        padding: 0.5rem 0.6rem;
        font-size: 11.5px;
        color: var(--text-dim);
        max-height: 300px;
        overflow: auto;
    }
    .chunks {
        background: var(--bg);
        border: 1px solid var(--border-soft);
        border-radius: 5px;
        padding: 0.5rem 0.6rem;
        font-size: 11.5px;
        color: var(--text-dim);
        max-height: 150px;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
    }
    .err {
        color: var(--err);
    }
</style>
