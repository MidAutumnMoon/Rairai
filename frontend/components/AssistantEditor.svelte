<script lang="ts">
    // Assistant (persona/preset) editor - an ordered list of prompt blocks, each
    // with a role/name/content/enabled, plus a `history` insertion-point marker.
    // Always "advanced" (IdoFront-style); system blocks -> systemPrompt, user/
    // assistant blocks -> example messages around the history marker (see
    // buildPreamble in server/llm/agent.ts).
    import type { AssistantInput, PromptBlock, PromptRole } from "../../shared/api.ts";
    import { chat } from "../lib/chat.svelte";
    import { getAssistant } from "../lib/api.ts";
    import { uid } from "../../shared/id.ts";
    import { messageOf } from "../../shared/error.ts";
    import Icon from "./ui/Icon.svelte";

    let {
        assistantId = null,
        onBack,
    }: { assistantId?: string | null; onBack: () => void } = $props();

    let name = $state("");
    let emoji = $state("✨");
    let description = $state("");
    let prompts = $state<PromptBlock[]>([]);
    let saving = $state(false);
    let error = $state<string | null>(null);

    const isEdit = $derived(assistantId !== null);
    const roleOptions: { value: PromptRole; label: string }[] = [
        { value: "system", label: "SYSTEM" },
        { value: "user", label: "USER" },
        { value: "assistant", label: "ASSISTANT" },
    ];

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
                })
                .catch((e) => (error = messageOf(e)));
        } else {
            name = "";
            emoji = "✨";
            description = "";
            prompts = [
                { id: uid("blk"), role: "system", name: "Main", content: "", enabled: true },
                { id: uid("blk"), role: "history", name: "History", content: "", enabled: true },
            ];
        }
    });

    function addBlock(role: PromptRole) {
        prompts = [...prompts, { id: uid("blk"), role, name: "", content: "", enabled: true }];
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
        prompts = prompts.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p));
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
        if (!confirm(`Delete assistant "${name}"? Its chats are kept but unassigned.`)) return;
        await chat.deleteAssistant(assistantId);
        onBack();
    }
</script>

<section class="view">
    <header class="view-head">
        <button class="btn btn-ghost btn-sm" onclick={onBack}>
            <Icon name="arrow-left" size={16} /> Back
        </button>
        <span class="view-title">{isEdit ? "Edit assistant" : "New assistant"}</span>
    </header>

    <div class="view-body">
        <div class="view-inner">
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

                    <div class="field">
                        <span class="lbl">
                            Prompt blocks
                            <span class="hint">
                                ordered; system -> system prompt, user/assistant -> messages around the history marker
                            </span>
                        </span>
                        <div class="pblocks">
                            {#each prompts as block, i (block.id)}
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
                                                onclick={() => toggleBlock(block.id)}
                                            >
                                                <Icon name={block.enabled ? "check" : "x"} size={15} />
                                            </button>
                                            <select
                                                class="pblock-role"
                                                value={block.role}
                                                onchange={(e) =>
                                                    patchBlock(block.id, {
                                                        role: (e.currentTarget as HTMLSelectElement)
                                                            .value as PromptRole,
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
                                                onclick={() => moveBlock(i, -1)}
                                                disabled={i === 0}
                                                title="Move up"
                                            >
                                                <Icon name="chevron-up" size={15} />
                                            </button>
                                            <button
                                                type="button"
                                                class="btn btn-icon btn-sm"
                                                onclick={() => moveBlock(i, 1)}
                                                disabled={i === prompts.length - 1}
                                                title="Move down"
                                            >
                                                <Icon name="chevron-down" size={15} />
                                            </button>
                                            <button
                                                type="button"
                                                class="btn btn-icon btn-sm danger"
                                                onclick={() => removeBlock(i)}
                                                title="Delete block"
                                            >
                                                <Icon name="trash" size={15} />
                                            </button>
                                        </div>
                                    </div>
                                    {#if block.role !== "history"}
                                        <textarea
                                            class="pblock-content"
                                            bind:value={block.content}
                                            placeholder={block.role === "system"
                                                ? "System instructions…"
                                                : block.role === "user"
                                                  ? "User example…"
                                                  : "Assistant example…"}
                                        ></textarea>
                                    {/if}
                                </div>
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

        <footer class="view-actions">
            {#if isEdit}
                <button class="btn btn-danger" onclick={remove}>Delete</button>
            {/if}
            <span class="grow"></span>
            <button class="btn" onclick={onBack}>Cancel</button>
            <button class="btn btn-primary" onclick={save} disabled={saving}>
                {saving ? "Saving…" : "Save"}
            </button>
        </footer>
    </section>
