<script lang="ts">
import { chat } from "../lib/chat.svelte";
import { listProviders } from "../lib/api.ts";
import type { Provider } from "../../shared/api.ts";
import Icon from "./ui/Icon.svelte";
import AssistantEditor from "./AssistantEditor.svelte";

let { focusAssistantId = null }: { focusAssistantId?: string | null } =
    $props();

let providers = $state<Provider[]>([]);
let providersLoaded = $state(false);
let editing = $state<string | null | undefined>(undefined);
// `undefined` = list view; a string (incl null target for "new") = editor open.

async function loadProviders() {
    try {
        providers = await listProviders();
    } finally {
        providersLoaded = true;
    }
}

$effect(() => {
    void loadProviders();
});

// When the parent requests a specific assistant (via prop), open it.
$effect(() => {
    if (focusAssistantId !== null) {
        editing = focusAssistantId;
    }
});

function openNew() {
    editing = null;
}
function back() {
    editing = undefined;
}

const shownAssistants = $derived(chat.assistants);
</script>

<div class="settings-content">
    {#if editing === undefined}
        <div class="toolbar">
            <span class="count">
                {shownAssistants.length} assistant{shownAssistants.length === 1 ? "" : "s"}
            </span>
            <span class="grow"></span>
            <button class="btn btn-sm btn-primary" onclick={openNew}>
                <Icon name="plus" size={14} /> New assistant
            </button>
        </div>

        {#if !providersLoaded}
            <div class="empty">Loading…</div>
        {:else if shownAssistants.length === 0}
            <div class="empty">No assistants. Click "+ New assistant" to create one.</div>
        {:else}
            {#each shownAssistants as a (a.id)}
                <button
                    class="manage-row asst-row"
                    class:active={a.id === chat.activeAssistantId}
                    onclick={() => (editing = a.id)}
                >
                    <span class="emoji">{a.emoji}</span>
                    <span class="manage-info">
                        <span class="manage-name">{a.name}</span>
                        {#if a.description}<span class="manage-desc">{a.description}</span>{/if}
                    </span>
                    <span class="grow"></span>
                    <span class="asst-model">
                        {#if a.providerId && a.modelId}
                            {providers.find((p) => p.id === a.providerId)?.name ?? "unknown"} · {a.modelId}
                        {:else}
                            <span class="dim">no model</span>
                        {/if}
                    </span>
                    <Icon name="pencil" size={14} class="asst-edit" />
                </button>
            {/each}
        {/if}
    {:else}
        <AssistantEditor
            assistantId={editing}
            providers={providers}
            onBack={back}
        />
    {/if}
</div>
