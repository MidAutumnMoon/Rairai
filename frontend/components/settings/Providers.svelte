<script lang="ts">
import {
    createProvider,
    deleteProvider,
    fetchProviderModels,
    listProviders,
    testProvider,
    updateProvider,
} from "$lib/api.ts";
import type { ApiType, Provider, ProviderInput } from "$shared/api.ts";
import { messageOf } from "$shared/error.ts";
import Icon from "$components/ui/Icon.svelte";
import ConnectionForm, { type FormState } from "./ConnectionForm.svelte";
import ModelsSection from "./ModelsSection.svelte";

let providers = $state<Provider[]>([]);
let loading = $state(false);
let error = $state<string | null>(null);
// undefined = nothing chosen yet (auto-selects first on load);
// null = the "New provider" form; a string = that provider's detail.
let selectedId = $state<string | null | undefined>(undefined);
let tests = $state<
    Record<string, "testing" | { ok: boolean; error?: string }>
>({});
let fetching = $state(false);

const selected = $derived(providers.find((p) => p.id === selectedId) ?? null);
const isNew = $derived(selectedId === null);

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

function syncForm() {
    formError = null;
    form = selected ? formFromProvider(selected) : blankForm();
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
                    {#if !p.enabled}<span class="tag dim">off</span>{/if}
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
                    <ConnectionForm
                        bind:form
                        {apiTypeOptions}
                        error={formError}
                        saving={formSaving}
                        onsave={saveProvider}
                    />
                    <p class="note">After saving, use "Fetch from API" in the model list to pull available models.</p>
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
                        <ConnectionForm
                            bind:form
                            {apiTypeOptions}
                            isEdit
                            error={formError}
                            saving={formSaving}
                            onsave={saveProvider}
                        />
                    {/if}
                    <ModelsSection
                        provider={selected}
                        {fetching}
                        onfetch={() => fetchModels(selected)}
                        onremove={(mid) => removeModel(selected, mid)}
                    />
                    {#if testView(selected.id)}
                        {@const tv = testView(selected.id)}
                        <div class="test-result {tv.state}">
                            {#if tv.state === "testing"}testing…
                            {:else if tv.state === "ok"}✓ ok
                            {:else}✗ {tv.error}{/if}
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
