<script lang="ts">
import { ToggleGroup } from "bits-ui";
import {
    createProvider,
    deleteProvider,
    fetchProviderModels,
    listProviders,
    testProvider,
    updateProvider,
} from "../lib/api.ts";
import type {
    ApiType,
    Model,
    Provider,
    ProviderInput,
} from "../../shared/api.ts";
import { messageOf } from "../../shared/error.ts";
import Icon from "./ui/Icon.svelte";
import Select from "./ui/Select.svelte";

let providers = $state<Provider[]>([]);
let loading = $state(false);
let error = $state<string | null>(null);
// keyed by provider id
let tests = $state<
    Record<string, "testing" | { ok: boolean; error?: string }>
>({});
// which provider's model panel is expanded
let expanded = $state<Record<string, boolean>>({});
// fetch-models in-flight state, keyed by provider id
let fetching = $state<Record<string, boolean>>({});

// --- provider form ---
interface FormState {
    name: string;
    apiType: ApiType;
    baseUrl: string;
    credSource: "env" | "inline";
    credRef: string;
    key: string;
    enabled: boolean;
}
function blankForm(): FormState {
    return {
        name: "",
        apiType: "openai-completions",
        baseUrl: "",
        credSource: "env",
        credRef: "",
        key: "",
        enabled: true,
    };
}
let formOpen = $state(false);
let editingId = $state<string | null>(null);
let form = $state<FormState>(blankForm());
let formSaving = $state(false);
let formError = $state<string | null>(null);

const apiTypeOptions = [
    { value: "openai-completions", label: "openai-completions" },
    { value: "openai-responses", label: "openai-responses" },
    { value: "anthropic-messages", label: "anthropic-messages" },
];

function credLabel(p: Provider): string {
    if (p.credential.source === "env") {
        return p.credential.ref ? `env: ${p.credential.ref}` : "env: (no var)";
    }
    return "inline";
}
type TestView =
    | { state: "testing" }
    | { state: "ok" }
    | { state: "err"; error: string }
    | null;
function testView(p: Provider): TestView {
    const t = tests[p.id];
    if (!t) return null;
    if (t === "testing") return { state: "testing" };
    return t.ok
        ? { state: "ok" }
        : { state: "err", error: t.error ?? "failed" };
}

/** Group a provider's models by their `group` field (maker), preserving order. */
function groupedModels(models: Model[]): { group: string; models: Model[] }[] {
    const out: { group: string; models: Model[] }[] = [];
    const seen = new Map<string, number>();
    for (const m of models) {
        const idx = seen.get(m.group);
        if (idx === undefined) {
            seen.set(m.group, out.length);
            out.push({ group: m.group, models: [m] });
        } else {
            out[idx].models.push(m);
        }
    }
    return out;
}

async function load() {
    loading = true;
    error = null;
    try {
        providers = await listProviders();
    } catch (e) {
        error = messageOf(e);
    } finally {
        loading = false;
    }
}

$effect(() => {
    void load();
});

// --- provider form actions ---
function openNew() {
    editingId = null;
    form = blankForm();
    formError = null;
    formOpen = true;
}
function openEdit(p: Provider) {
    editingId = p.id;
    form = {
        name: p.name,
        apiType: p.apiType === "faux" ? "openai-completions" : p.apiType,
        baseUrl: p.baseUrl,
        credSource: p.credential.source,
        credRef: p.credential.ref ?? "",
        key: "",
        enabled: p.enabled,
    };
    formError = null;
    formOpen = true;
}
function closeForm() {
    formOpen = false;
    editingId = null;
    formError = null;
}
async function saveProvider() {
    formError = null;
    const name = form.name.trim();
    if (!name) {
        formError = "Name is required.";
        return;
    }
    if (form.credSource === "env" && !form.credRef.trim()) {
        formError = "Env var name is required for env credentials.";
        return;
    }
    if (form.credSource === "inline" && !editingId && !form.key) {
        formError = "An inline key is required when creating a new provider.";
        return;
    }
    // On edit without a fetch, keep the existing model list.
    const existing = editingId
        ? providers.find((p) => p.id === editingId)
        : null;
    const input: ProviderInput = {
        name,
        apiType: form.apiType,
        baseUrl: form.baseUrl.trim(),
        models: existing?.models ?? [],
        credential: form.credSource === "env"
            ? { source: "env", ref: form.credRef.trim() }
            : { source: "inline" },
        enabled: form.enabled,
    };
    if (form.credSource === "inline" && form.key) input.key = form.key;

    formSaving = true;
    try {
        if (editingId) await updateProvider(editingId, input);
        else await createProvider(input);
        closeForm();
        await load();
    } catch (e) {
        formError = messageOf(e);
    } finally {
        formSaving = false;
    }
}
async function toggleEnabled(p: Provider) {
    try {
        await updateProvider(p.id, {
            name: p.name,
            apiType: p.apiType,
            baseUrl: p.baseUrl,
            models: p.models,
            credential: { source: p.credential.source, ref: p.credential.ref },
            enabled: !p.enabled,
        });
        await load();
    } catch (e) {
        error = messageOf(e);
    }
}
async function testP(p: Provider) {
    tests[p.id] = "testing";
    try {
        tests[p.id] = await testProvider(p.id);
    } catch (e) {
        tests[p.id] = { ok: false, error: messageOf(e) };
    }
}
async function removeProvider(p: Provider) {
    if (!confirm(`Delete provider "${p.name}"?`)) return;
    try {
        await deleteProvider(p.id);
        await load();
    } catch (e) {
        error = messageOf(e);
    }
}

// --- model management ---
async function fetchModels(p: Provider) {
    fetching[p.id] = true;
    try {
        await fetchProviderModels(p.id);
        await load();
    } catch (e) {
        error = messageOf(e);
    } finally {
        fetching[p.id] = false;
    }
}
function toggleExpand(p: Provider) {
    expanded[p.id] = !expanded[p.id];
}
async function removeModel(p: Provider, modelId: string) {
    const models = p.models.filter((m) => m.id !== modelId);
    try {
        await updateProvider(p.id, {
            name: p.name,
            apiType: p.apiType,
            baseUrl: p.baseUrl,
            models,
            credential: { source: p.credential.source, ref: p.credential.ref },
            enabled: p.enabled,
        });
        await load();
    } catch (e) {
        error = messageOf(e);
    }
}
</script>

<div class="settings-content">
    <div class="toolbar">
        <span class="count">
            {providers.length} provider{providers.length === 1 ? "" : "s"}
        </span>
        <span class="grow"></span>
        <button class="btn btn-sm btn-primary" onclick={openNew}>
            <Icon name="plus" size={14} /> New provider
        </button>
    </div>

    {#if formOpen}
        <div class="form-card">
            <div class="form-head">
                <span>{editingId ? "Edit provider" : "New provider"}</span>
                <button class="btn btn-icon btn-sm" onclick={closeForm} aria-label="Close form">
                    <Icon name="x" size={14} />
                </button>
            </div>

            <div class="grid">
                <label class="field">
                    <span class="lbl">Name</span>
                    <input class="input" bind:value={form.name} placeholder="My OpenAI" />
                </label>
                <div class="field">
                    <span class="lbl">API type</span>
                    <Select bind:value={form.apiType} items={apiTypeOptions} />
                </div>
                <label class="field wide">
                    <span class="lbl">
                        Base URL <span class="hint">must include /v1 for openai-*</span>
                    </span>
                    <input
                        class="input"
                        bind:value={form.baseUrl}
                        placeholder="https://api.openai.com/v1"
                    />
                </label>
                <div class="field wide">
                    <span class="lbl">Credential source</span>
                    <ToggleGroup.Root type="single" bind:value={form.credSource} class="seg">
                        <ToggleGroup.Item class="seg-item" value="env">env var</ToggleGroup.Item>
                        <ToggleGroup.Item class="seg-item" value="inline">inline key</ToggleGroup.Item>
                    </ToggleGroup.Root>
                    {#if form.credSource === "env"}
                        <label class="sub">
                            <span class="lbl">Env var name</span>
                            <input
                                class="input"
                                bind:value={form.credRef}
                                placeholder="OPENAI_API_KEY"
                            />
                            <span class="hint">read from the server environment (not a secret)</span>
                        </label>
                    {:else}
                        <label class="sub">
                            <span class="lbl">
                                API key
                                {#if editingId}<span class="hint">(leave blank to keep existing)</span>{/if}
                            </span>
                            <input
                                class="input"
                                type="password"
                                bind:value={form.key}
                                placeholder={editingId ? "••••••••" : "sk-..."}
                                autocomplete="off"
                            />
                            <span class="hint">stored on the server (0600); never returned</span>
                        </label>
                    {/if}
                </div>
                <label class="field check">
                    <input type="checkbox" bind:checked={form.enabled} />
                    <span>enabled</span>
                </label>
            </div>

            {#if editingId}
                <p class="note">
                    Models are managed in the provider's panel below (Fetch from API) - not in this form.
                </p>
            {/if}

            {#if formError}
                <div class="err-msg">{formError}</div>
            {/if}

            <div class="form-actions">
                <button class="btn btn-primary" onclick={saveProvider} disabled={formSaving}>
                    {formSaving ? "Saving…" : "Save"}
                </button>
                <button class="btn" onclick={closeForm} disabled={formSaving}>Cancel</button>
            </div>
        </div>
    {/if}

    {#if loading && providers.length === 0}
        <div class="empty">Loading…</div>
    {:else if providers.length === 0}
        <div class="empty">No providers configured. Click "+ New provider" to add one.</div>
    {:else}
        {#each providers as p (p.id)}
            {@const tv = testView(p)}
            <div class="prov">
                <div class="prov-top">
                    <button
                        class="prov-expand"
                        onclick={() => toggleExpand(p)}
                        aria-label={expanded[p.id] ? "Collapse models" : "Expand models"}
                    >
                        <Icon name="chevron-right" size={14} class={expanded[p.id] ? "rotated" : ""} />
                    </button>
                    <span class="pname">{p.name}</span>
                    <span class="badge">{p.apiType}</span>
                    {#if !p.enabled}<span class="tag dim">disabled</span>{/if}
                    <span class="grow"></span>
                    <button class="btn btn-sm" onclick={() => toggleEnabled(p)}>
                        {p.enabled ? "disable" : "enable"}
                    </button>
                </div>
                <div class="prov-meta">
                    <span class="kv"><b>models:</b> {p.models.length}</span>
                    <span class="kv"><b>cred:</b> {credLabel(p)}</span>
                    <span class="kv"><b>base:</b> {p.baseUrl || "-"}</span>
                </div>
                {#if tv}
                    <div class="test-result {tv.state}">
                        {#if tv.state === "testing"}
                            testing…
                        {:else if tv.state === "ok"}
                            ✓ ok
                        {:else}
                            ✗ {tv.error}
                        {/if}
                    </div>
                {/if}

                {#if expanded[p.id]}
                    <div class="prov-models">
                        <div class="prov-models-head">
                            <span class="lbl">Models</span>
                            <span class="grow"></span>
                            <button
                                class="btn btn-sm"
                                onclick={() => fetchModels(p)}
                                disabled={fetching[p.id] || p.apiType === "faux"}
                                title={p.apiType === "faux"
                                    ? "Faux providers have no API to fetch from"
                                    : ""}
                            >
                                {fetching[p.id] ? "Fetching…" : "Fetch from API"}
                            </button>
                        </div>
                        {#if p.models.length === 0}
                            <div class="empty-sm">
                                No models. Click "Fetch from API" to pull the list from the provider.
                            </div>
                        {:else}
                            {#each groupedModels(p.models) as g (g.group)}
                                <div class="model-group">
                                    <div class="model-group-head">{g.group}</div>
                                    <div class="model-list">
                                        {#each g.models as m (m.id)}
                                            <div class="model-row">
                                                <span class="model-name" title={m.id}>{m.name}</span>
                                                <span class="model-id">{m.id}</span>
                                                <button
                                                    class="btn btn-icon btn-sm danger"
                                                    onclick={() => removeModel(p, m.id)}
                                                    title="Remove model"
                                                >
                                                    <Icon name="x" size={13} />
                                                </button>
                                            </div>
                                        {/each}
                                    </div>
                                </div>
                            {/each}
                        {/if}
                    </div>
                {/if}

                <div class="prov-actions">
                    <button class="btn btn-sm" onclick={() => testP(p)}>Test</button>
                    {#if p.apiType !== "faux"}
                        <button class="btn btn-sm" onclick={() => openEdit(p)}>Edit</button>
                    {/if}
                    <button class="btn btn-sm btn-danger" onclick={() => removeProvider(p)}>
                        Delete
                    </button>
                </div>
            </div>
        {/each}
    {/if}

    {#if error}
        <div class="err-msg">{error}</div>
    {/if}
</div>
