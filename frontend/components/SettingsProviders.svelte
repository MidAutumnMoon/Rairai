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
// The selected provider id; `null` = the "New provider" form.
let selectedId = $state<string | null | undefined>(undefined);
let tests = $state<
    Record<string, "testing" | { ok: boolean; error?: string }>
>({});
let fetching = $state(false);

const selected = $derived(providers.find((p) => p.id === selectedId) ?? null);
const isNew = $derived(selectedId === null);

// --- provider form (create/edit connection settings) ---
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
function formFromProvider(p: Provider): FormState {
    return {
        name: p.name,
        apiType: p.apiType === "faux" ? "openai-completions" : p.apiType,
        baseUrl: p.baseUrl,
        credSource: p.credential.source,
        credRef: p.credential.ref ?? "",
        key: "",
        enabled: p.enabled,
    };
}
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
function testView(id: string): TestView {
    const t = tests[id];
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
        if (selectedId && !providers.some((p) => p.id === selectedId)) {
            selectedId = providers[0]?.id ?? null;
        } else if (selectedId === undefined && providers.length) {
            selectedId = providers[0].id;
        }
        syncForm();
    } catch (e) {
        error = messageOf(e);
    } finally {
        loading = false;
    }
}

// Sync the form to the selected provider whenever the selection changes.
function syncForm() {
    formError = null;
    if (selected) {
        form = formFromProvider(selected);
    } else {
        form = blankForm();
    }
}
$effect(() => {
    void selectedId;
    syncForm();
});

$effect(() => {
    void load();
});

function selectProvider(id: string) {
    selectedId = id;
}
function openNew() {
    selectedId = null;
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
    if (form.credSource === "inline" && !selectedId && !form.key) {
        formError = "An inline key is required when creating a new provider.";
        return;
    }
    const existing = selected;
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
        if (selected) {
            const updated = await updateProvider(selected.id, input);
            await load();
            if (updated) selectedId = updated.id;
        } else {
            const created = await createProvider(input);
            await load();
            selectedId = created.id;
        }
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
    fetching = true;
    try {
        await fetchProviderModels(p.id);
        await load();
    } catch (e) {
        error = messageOf(e);
    } finally {
        fetching = false;
    }
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

<div class="settings-split">
    <nav class="sub-nav">
        <div class="sub-nav-head">
            <span class="count">
                {providers.length} provider{providers.length === 1 ? "" : "s"}
            </span>
            <span class="grow"></span>
        </div>
        <div class="sub-nav-list">
            {#each providers as p (p.id)}
                <button
                    class="sub-nav-item"
                    class:active={selectedId === p.id}
                    onclick={() => selectProvider(p.id)}
                    title={p.name}
                >
                    <span class="sub-nav-item-name">{p.name}</span>
                    {#if !p.enabled}
                        <span class="tag dim">off</span>
                    {/if}
                </button>
            {/each}
        </div>
        <button class="btn btn-sm btn-ghost sub-nav-add" onclick={openNew}>
            <Icon name="plus" size={14} /> New provider
        </button>
    </nav>

    <div class="sub-detail">
        {#if loading && !providers.length}
            <div class="sub-detail-body"><div class="sub-detail-inner"><div class="empty">Loading…</div></div></div>
        {:else if isNew}
            <header class="sub-detail-head">
                <span class="sub-detail-title">New provider</span>
            </header>
            <div class="sub-detail-body">
                <div class="sub-detail-inner">
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
                                    <span class="lbl">API key</span>
                                    <input
                                        class="input"
                                        type="password"
                                        bind:value={form.key}
                                        placeholder="sk-..."
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
                    <p class="note">After saving, use "Fetch from API" in the model list to pull available models.</p>

                    {#if formError}
                        <div class="err-msg">{formError}</div>
                    {/if}

                    <div class="form-actions">
                        <button class="btn btn-primary" onclick={saveProvider} disabled={formSaving}>
                            {formSaving ? "Creating…" : "Create provider"}
                        </button>
                    </div>
                </div>
            </div>
        {:else if selected}
            <header class="sub-detail-head">
                <span class="sub-detail-title">{selected.name}</span>
                <div class="head-actions">
                    <span class="badge">{selected.apiType}</span>
                    {#if !selected.enabled}<span class="tag dim">disabled</span>{/if}
                    <button class="btn btn-sm" onclick={() => toggleEnabled(selected)}>
                        {selected.enabled ? "Disable" : "Enable"}
                    </button>
                    <button class="btn btn-sm" onclick={() => testP(selected)}>Test</button>
                    <button class="btn btn-sm btn-danger" onclick={() => removeProvider(selected)}>
                        Delete
                    </button>
                </div>
            </header>
            <div class="sub-detail-body">
                <div class="sub-detail-inner">
                    {#if selected.apiType !== "faux"}
                        <section class="field-group">
                            <h3 class="field-group-title">Connection</h3>
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
                                                <span class="hint">(leave blank to keep existing)</span>
                                            </span>
                                            <input
                                                class="input"
                                                type="password"
                                                bind:value={form.key}
                                                placeholder="••••••••"
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
                            {#if formError}
                                <div class="err-msg">{formError}</div>
                            {/if}
                            <div class="form-actions">
                                <button class="btn btn-primary" onclick={saveProvider} disabled={formSaving}>
                                    {formSaving ? "Saving…" : "Save"}
                                </button>
                            </div>
                        </section>
                    {/if}

                    <section class="field-group">
                        <div class="field-group-head">
                            <h3 class="field-group-title">
                                Models
                                <span class="hint">{selected.models.length}</span>
                            </h3>
                            <span class="grow"></span>
                            <button
                                class="btn btn-sm"
                                onclick={() => fetchModels(selected)}
                                disabled={fetching || selected.apiType === "faux"}
                                title={selected.apiType === "faux"
                                    ? "Faux providers have no API to fetch from"
                                    : "Pull model list from the provider's API"}
                            >
                                {fetching ? "Fetching…" : "Fetch from API"}
                            </button>
                        </div>
                        {#if selected.models.length === 0}
                            <div class="empty-sm">
                                No models. Click "Fetch from API" to pull the list from the provider.
                            </div>
                        {:else}
                            {#each groupedModels(selected.models) as g (g.group)}
                                <div class="model-group">
                                    <div class="model-group-head">{g.group}</div>
                                    <div class="model-list">
                                        {#each g.models as m (m.id)}
                                            <div class="model-row">
                                                <span class="model-name" title={m.id}>{m.name}</span>
                                                <span class="model-id">{m.id}</span>
                                                <button
                                                    class="btn btn-icon btn-sm danger"
                                                    onclick={() => removeModel(selected, m.id)}
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
                    </section>

                    {#if testView(selected.id)}
                        {@const tv = testView(selected.id)}
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
                </div>
            </div>
        {:else}
            <div class="sub-detail-body"><div class="sub-detail-inner"><div class="empty">Select a provider or add a new one.</div></div></div>
        {/if}

        {#if error}
            <div class="sub-detail-body"><div class="sub-detail-inner"><div class="err-msg">{error}</div></div></div>
        {/if}
    </div>
</div>
