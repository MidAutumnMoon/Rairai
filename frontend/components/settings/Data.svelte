<script lang="ts">
import { listConversations } from "$lib/api.ts";
import type { ConversationSummary } from "$shared/api.ts";
import { chat } from "$lib/chat.svelte";
import { messageOf } from "$shared/error.ts";

let convos = $state<ConversationSummary[]>([]);
let loading = $state(false);
let clearing = $state(false);
let error = $state<string | null>(null);
let result = $state<string | null>(null);

async function load() {
    loading = true;
    error = null;
    try {
        convos = await listConversations();
    } catch (e) {
        error = messageOf(e);
    } finally {
        loading = false;
    }
}

$effect(() => {
    void load();
});

async function clearAll() {
    if (!convos.length) return;
    if (
        !confirm(
            `Delete all ${convos.length} conversations? This cannot be undone.`,
        )
    ) return;
    clearing = true;
    result = null;
    try {
        await chat.clearAllConversations();
        await load();
        result = "Deleted all conversations.";
    } catch (e) {
        result = `Failed: ${messageOf(e)}`;
    } finally {
        clearing = false;
    }
}
</script>

<div class="settings-content">
    <div class="section">
        <div class="stat">
            {#if loading}
                <span class="dim">loading…</span>
            {:else}
                <span><b>{convos.length}</b> conversations</span>
            {/if}
        </div>

        <button class="btn btn-danger" onclick={clearAll} disabled={clearing || !convos.length}>
            {clearing ? "Deleting…" : "Clear all conversations"}
        </button>

        {#if error}
            <div class="err-msg">{error}</div>
        {/if}
        {#if result}
            <div class="ok-msg">{result}</div>
        {/if}

        <p class="note">
            Provider keys configured as env are read from the server environment; inline keys are
            stored in the server's data dir.
        </p>
    </div>
</div>
