<script lang="ts">
// Assistant (persona/preset) editor - an ordered list of prompt blocks, each
// with a role/name/content/enabled, plus a `history` insertion-point marker.
// Always "advanced" (IdoFront-style); system blocks -> systemPrompt, user/
// assistant blocks -> example messages around the history marker (see
// buildPreamble in server/llm/agent.ts). Also binds the provider + model the
// assistant uses (Cherry Studio-style: both nullable, no silent fallback).
import type {
    AssistantInput,
    PromptBlock,
    PromptRole,
    Provider,
} from "$shared/api.ts";
import { chat } from "$lib/chat.svelte";
import { getAssistant } from "$lib/api.ts";
import { uid } from "$shared/id.ts";
import { messageOf } from "$shared/error.ts";
import Icon from "$components/ui/Icon.svelte";
import Select from "$components/ui/Select.svelte";
import Block from "./Block.svelte";

let {
    assistantId = null,
    providers = [],
    onBack,
}: {
    assistantId?: string | null;
    providers?: Provider[];
    onBack: () => void;
} = $props();

let name = $state("");
let emoji = $state("✨");
let description = $state("");
let prompts = $state<PromptBlock[]>([]);
let providerId = $state<string>("");
let modelId = $state<string>("");
let saving = $state(false);
let error = $state<string | null>(null);

const isEdit = $derived(assistantId !== null);
const roleOptions: { value: PromptRole; label: string }[] = [
    { value: "system", label: "SYSTEM" },
    { value: "user", label: "USER" },
    { value: "assistant", label: "ASSISTANT" },
];

// Enabled providers only; the model list is the chosen provider's models.
const enabledProviders = $derived(providers.filter((p) => p.enabled));
const providerOptions = $derived([
    { value: "", label: "- none -" },
    ...enabledProviders.map((p) => ({ value: p.id, label: p.name })),
]);
const selectedProvider = $derived(
    enabledProviders.find((p) => p.id === providerId),
);
const modelOptions = $derived([
    { value: "", label: "- none -" },
    ...(selectedProvider?.models ?? []).map((m) => ({
        value: m.id,
        label: m.name,
    })),
]);

// Load the assistant (or seed a blank one) on mount / when the target changes.
$effect(() => {
    const id = assistantId;
    error = null;
    if (id) {
        getAssistant(id)
            .then((a) => {
                name = a.name;
                emoji = a.emoji;
                description = a.description;
                prompts = a.prompts;
                providerId = a.providerId ?? "";
                modelId = a.modelId ?? "";
            })
            .catch((e) => (error = messageOf(e)));
    } else {
        name = "";
        emoji = "✨";
        description = "";
        prompts = [
            {
                id: uid("blk"),
                role: "system",
                name: "Main",
                content: "",
                enabled: true,
            },
            {
                id: uid("blk"),
                role: "history",
                name: "History",
                content: "",
                enabled: true,
            },
        ];
        providerId = "";
        modelId = "";
    }
});

// When the provider changes, clear a model that's no longer valid.
$effect(() => {
    const pid = providerId;
    const models = selectedProvider?.models ?? [];
    if (!models.some((m) => m.id === modelId)) {
        modelId = "";
    }
    void pid;
});

function addBlock(role: PromptRole) {
    prompts = [...prompts, {
        id: uid("blk"),
        role,
        name: "",
        content: "",
        enabled: true,
    }];
}
function moveBlock(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= prompts.length) return;
    const next = [...prompts];
    [next[i], next[j]] = [next[j], next[i]];
    prompts = next;
}
function removeBlock(i: number) {
    prompts = prompts.filter((_, k) => k !== i);
}
function toggleBlock(id: string) {
    prompts = prompts.map((
        p,
    ) => (p.id === id ? { ...p, enabled: !p.enabled } : p));
}
function patchBlock(id: string, patch: Partial<PromptBlock>) {
    prompts = prompts.map((p) => (p.id === id ? { ...p, ...patch } : p));
}

async function save() {
    error = null;
    if (!name.trim()) {
        error = "Name is required.";
        return;
    }
    const input: AssistantInput = {
        name: name.trim(),
        emoji: emoji.trim() || "✨",
        description: description.trim(),
        prompts,
        providerId: providerId || null,
        modelId: modelId || null,
    };
    saving = true;
    try {
        if (assistantId) await chat.saveAssistant(assistantId, input);
        else await chat.createAssistant(input);
        onBack();
    } catch (e) {
        error = messageOf(e);
    } finally {
        saving = false;
    }
}
async function remove() {
    if (!assistantId) return;
    if (
        !confirm(
            `Delete assistant "${name}"? Its chats are kept but unassigned.`,
        )
    ) return;
    await chat.deleteAssistant(assistantId);
    onBack();
}
</script>

<div class="sub-detail">
    <header class="sub-detail-head">
        <span
            class="sub-detail-title">{isEdit ? "Edit assistant" : "New assistant"}</span>
        <div class="head-actions">
            {#if isEdit}
                <button class="btn btn-sm btn-danger" onclick={remove}>Delete</button>
            {/if}
            <button class="btn btn-sm" onclick={onBack}>Cancel</button>
            <button class="btn btn-sm btn-primary" onclick={save} disabled={saving}>
                {saving ? "Saving…" : "Save"}
            </button>
        </div>
    </header>
    <div class="sub-detail-body">
        <div class="sub-detail-inner">
            <div class="grid">
                <label class="field">
                    <span class="lbl">Name</span>
                    <input class="input" bind:value={name} placeholder="My assistant" />
                </label>
                <label class="field">
                    <span class="lbl">Emoji</span>
                    <input class="input" bind:value={emoji} placeholder="✨" maxlength="4" />
                </label>
            </div>
            <label class="field">
                <span class="lbl">Description</span>
                <input class="input" bind:value={description} placeholder="What is this assistant for?" />
            </label>

            <div class="grid">
                <div class="field">
                    <span class="lbl">Provider</span>
                    <Select bind:value={providerId} items={providerOptions} />
                </div>
                <div class="field">
                    <span class="lbl">Model</span>
                    <Select bind:value={modelId} items={modelOptions} />
                </div>
            </div>
            {#if !providerId}
                <p class="note">No provider bound. This assistant can't run until you pick a model.</p>
            {/if}

            <div class="field">
                <span class="lbl">
                    Prompt blocks
                    <span class="hint">
                        ordered; system -> system prompt, user/assistant -> messages around the history marker
                    </span>
                </span>
                <div class="pblocks">
                    {#each prompts as block, i (block.id)}
                        <Block
                            {block}
                            index={i}
                            first={i === 0}
                            last={i === prompts.length - 1}
                            {roleOptions}
                            ontoggle={toggleBlock}
                            onpatch={patchBlock}
                            onmove={moveBlock}
                            onremove={removeBlock}
                        />
                    {/each}
                </div>
                <div class="pblock-add">
                    <button type="button" class="btn btn-sm" onclick={() => addBlock("system")}>+ System</button>
                    <button type="button" class="btn btn-sm" onclick={() => addBlock("user")}>+ User</button>
                    <button type="button" class="btn btn-sm" onclick={() => addBlock("assistant")}>+ Assistant</button>
                    <button type="button" class="btn btn-sm" onclick={() => addBlock("history")}>+ History marker</button>
                </div>
            </div>

            {#if error}
                <div class="err-msg">{error}</div>
            {/if}
        </div>
    </div>
</div>

<style>
    .pblocks {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
    }
    .pblock-add {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
    }
</style>