<script lang="ts">
import { chat } from "$lib/chat.svelte";
import { listProviders } from "$lib/api.ts";
import type { Provider } from "$shared/api.ts";
import Plus from "@lucide/svelte/icons/plus";
import AssistantEditor from "./Editor.svelte";

let { focusAssistantId = null }: { focusAssistantId?: string | null } =
    $props();

let providers = $state<Provider[]>([]);
let providersLoaded = $state(false);
// The selected assistant id; `null` = "New assistant" form.
let selectedId = $state<string | null>(null);
// Track whether we're focused on a specific assistant (from external nav).
let focusedFromExternal = $state(false);

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

// When the parent requests a specific assistant (via prop), select it.
$effect(() => {
    if (focusAssistantId !== null) {
        selectedId = focusAssistantId;
        focusedFromExternal = true;
    }
});

// Default to the first assistant once loaded.
$effect(() => {
    if (!selectedId && chat.assistants.length) {
        selectedId = chat.assistants[0].id;
    }
});

const selected = $derived(
    chat.assistants.find((a) => a.id === selectedId) ?? null,
);
const isNew = $derived(selectedId === null);

function selectAssistant(id: string) {
    selectedId = id;
    focusedFromExternal = false;
}
function openNew() {
    selectedId = null;
    focusedFromExternal = false;
}
function back() {
    // From the editor back button: return to the list (deselect to the
    // first assistant if we were on "new").
    if (!selected) {
        selectedId = chat.assistants[0]?.id ?? null;
    }
    focusedFromExternal = false;
}

function modelLabel(
    a: { providerId: string | null; modelId: string | null },
): string {
    if (!a.providerId || !a.modelId) return "no model";
    const p = providers.find((x) => x.id === a.providerId);
    return p ? `${p.name} · ${a.modelId}` : `unknown · ${a.modelId}`;
}
</script>

<div class="settings-split">
    <nav class="sub-nav">
        <div class="sub-nav-head">
            <span class="count">
                {chat.assistants.length} assistant{chat.assistants.length === 1 ? "" : "s"}
            </span>
            <span class="grow"></span>
        </div>
        <div class="sub-nav-list">
            {#each chat.assistants as a (a.id)}
                <button
                    class="sub-nav-item"
                    class:active={selectedId === a.id}
                    onclick={() => selectAssistant(a.id)}
                    title={a.name}
                >
                    <span class="asst-emoji">{a.emoji}</span>
                    <span class="sub-nav-item-name">{a.name}</span>
                </button>
            {/each}
        </div>
        <button class="btn btn-sm btn-ghost sub-nav-add" onclick={openNew}>
            <Plus size={14} /> New assistant
        </button>
    </nav>

    <div class="sub-detail">
        {#if !providersLoaded}
            <div class="sub-detail-body"><div class="sub-detail-inner"><div class="empty">Loading…</div></div></div>
        {:else if selected}
            <AssistantEditor
                assistantId={selected.id}
                {providers}
                onBack={back}
            />
        {:else if isNew}
            <AssistantEditor
                assistantId={null}
                {providers}
                onBack={back}
            />
        {:else}
            <div class="sub-detail-body"><div class="sub-detail-inner"><div class="empty">Select an assistant or add a new one.</div></div></div>
        {/if}
    </div>
</div>
