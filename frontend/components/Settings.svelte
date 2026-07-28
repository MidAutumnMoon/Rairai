<script lang="ts">
    import { Switch, ToggleGroup } from "bits-ui";
    import {
        listProviders,
        createProvider,
        updateProvider,
        deleteProvider,
        testProvider,
        getSettings,
        updateSettings,
        listConversations,
    } from "../lib/api.ts";
    import type { Provider, ProviderInput, Settings, ApiType } from "../../shared/api.ts";
    import type { ConversationSummary } from "../../shared/api.ts";
    import { chat } from "../lib/chat.svelte";
    import { messageOf } from "../../shared/error.ts";
    import Icon from "./ui/Icon.svelte";
    import Select from "./ui/Select.svelte";

    let { tab }: { tab: string } = $props();

    // --- shared (Providers tab) state ---
    let providers = $state<Provider[]>([]);
    let settings = $state<Settings | null>(null);
    let loadingProviders = $state(false);
    let provError = $state<string | null>(null);
    // keyed by provider id; "testing" while in flight
    let tests = $state<Record<string, "testing" | { ok: boolean; error?: string }>>({});

    // --- provider form ---
    interface FormState {
        name: string;
        apiType: ApiType;
        baseUrl: string;
        modelsText: string;
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
            modelsText: "",
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

    // --- General tab state ---
    let genProviders = $state<Provider[]>([]);
    let genStream = $state(false);
    let genProviderId = $state("");
    let genModel = $state("");
    let genSaving = $state(false);
    let genSaved = $state(false);
    let genError = $state<string | null>(null);
    const genModels = $derived(
        genProviders.find((p) => p.id === genProviderId)?.models ?? [],
    );
    const providerOptions = $derived([
        { value: "", label: "- none -" },
        ...genProviders.map((p) => ({ value: p.id, label: p.name })),
    ]);
    const modelOptions = $derived([
        { value: "", label: "- none -" },
        ...genModels.map((m) => ({ value: m, label: m })),
    ]);

    // --- Data tab state ---
    let convos = $state<ConversationSummary[]>([]);
    let dataLoading = $state(false);
    let dataClearing = $state(false);
    let dataError = $state<string | null>(null);
    let dataResult = $state<string | null>(null);

    // --- helpers ---
    function credLabel(p: Provider): string {
        if (p.credential.source === "env") {
            return p.credential.ref ? `env: ${p.credential.ref}` : "env: (no var)";
        }
        // The wire record does not expose whether an inline key is stored;
        // use the Test action to verify. Never display the secret itself.
        return "inline";
    }
    type TestView = { state: "testing" } | { state: "ok" } | { state: "err"; error: string } | null;
    function testView(p: Provider): TestView {
        const t = tests[p.id];
        if (!t) return null;
        if (t === "testing") return { state: "testing" };
        return t.ok ? { state: "ok" } : { state: "err", error: t.error ?? "failed" };
    }

    // --- loaders ---
    async function loadProviders() {
        loadingProviders = true;
        provError = null;
        try {
            providers = await listProviders();
        } catch (e) {
            provError = messageOf(e);
        } finally {
            loadingProviders = false;
        }
    }
    async function loadSettings() {
        try {
            settings = await getSettings();
        } catch (e) {
            provError = messageOf(e);
        }
    }
    async function loadGeneral() {
        genError = null;
        try {
            const [s, ps] = await Promise.all([getSettings(), listProviders()]);
            settings = s;
            genProviders = ps;
            genStream = s.defaultStream;
            genProviderId = s.activeProviderId ?? "";
            genModel = s.activeModel ?? "";
        } catch (e) {
            genError = messageOf(e);
        }
    }
    async function loadData() {
        dataLoading = true;
        dataError = null;
        try {
            convos = await listConversations();
        } catch (e) {
            dataError = messageOf(e);
        } finally {
            dataLoading = false;
        }
    }

    // --- effects ---
    // Load Providers-tab data once on mount (the view mounts when shown).
    $effect(() => {
        void loadProviders();
        void loadSettings();
    });
    // Refresh General-tab data whenever it becomes active.
    $effect(() => {
        if (tab === "general") void loadGeneral();
    });
    // Refresh Data-tab data whenever it becomes active.
    $effect(() => {
        if (tab === "data") void loadData();
    });
    // Keep the active-model select valid for the chosen provider.
    $effect(() => {
        const pid = genProviderId;
        const models = genProviders.find((p) => p.id === pid)?.models ?? [];
        const desired = models.includes(genModel) ? genModel : (models[0] ?? "");
        if (desired !== genModel) genModel = desired;
    });

    // --- provider actions ---
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
            modelsText: p.models.join(", "),
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
        const models = form.modelsText.split(",").map((s) => s.trim()).filter(Boolean);
        if (models.length === 0) {
            formError = "At least one model is required.";
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
        const input: ProviderInput = {
            name,
            apiType: form.apiType,
            baseUrl: form.baseUrl.trim(),
            models,
            credential:
                form.credSource === "env"
                    ? { source: "env", ref: form.credRef.trim() }
                    : { source: "inline" },
            enabled: form.enabled,
        };
        // The secret is sent only when an inline key is being set/rotated.
        if (form.credSource === "inline" && form.key) input.key = form.key;

        formSaving = true;
        try {
            if (editingId) await updateProvider(editingId, input);
            else await createProvider(input);
            closeForm();
            await loadProviders();
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
            await loadProviders();
        } catch (e) {
            provError = messageOf(e);
        }
    }
    async function setActive(p: Provider) {
        try {
            settings = await updateSettings({
                activeProviderId: p.id,
                activeModel: p.models[0] ?? null,
            });
        } catch (e) {
            provError = messageOf(e);
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
            if (settings?.activeProviderId === p.id) await loadSettings();
            await loadProviders();
        } catch (e) {
            provError = messageOf(e);
        }
    }

    // --- general actions ---
    async function saveGeneral() {
        genSaving = true;
        genError = null;
        genSaved = false;
        try {
            const patch: Partial<Settings> = {
                defaultStream: genStream,
                activeProviderId: genProviderId || null,
                activeModel: genModel || null,
            };
            const s = await updateSettings(patch);
            settings = s;
            genStream = s.defaultStream;
            genProviderId = s.activeProviderId ?? "";
            genModel = s.activeModel ?? "";
            genSaved = true;
            setTimeout(() => {
                genSaved = false;
            }, 2500);
        } catch (e) {
            genError = messageOf(e);
        } finally {
            genSaving = false;
        }
    }

    // --- data actions ---
    async function clearAll() {
        if (!convos.length) return;
        if (!confirm(`Delete all ${convos.length} conversations? This cannot be undone.`)) return;
        dataClearing = true;
        dataResult = null;
        try {
            await chat.clearAllConversations();
            await loadData();
            dataResult = "Deleted all conversations.";
        } catch (e) {
            dataResult = `Failed: ${messageOf(e)}`;
        } finally {
            dataClearing = false;
        }
    }
</script>

<div class="settings-content">
    {#if tab === "providers"}
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
                                    <button
                                        class="btn btn-icon btn-sm"
                                        onclick={closeForm}
                                        aria-label="Close form"
                                    >
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
                                    <label class="field wide">
                                        <span class="lbl">Models <span class="hint">comma-separated</span></span>
                                        <input
                                            class="input"
                                            bind:value={form.modelsText}
                                            placeholder="gpt-4o-mini, gpt-4o"
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

                        {#if loadingProviders && providers.length === 0}
                            <div class="empty">Loading…</div>
                        {:else if providers.length === 0}
                            <div class="empty">No providers configured. Click “+ New provider” to add one.</div>
                        {:else}
                            {#each providers as p (p.id)}
                                {@const tv = testView(p)}
                                <div class="prov" class:active={settings?.activeProviderId === p.id}>
                                    <div class="prov-top">
                                        <span class="pname">{p.name}</span>
                                        <span class="badge">{p.apiType}</span>
                                        {#if settings?.activeProviderId === p.id}
                                            <span class="tag">active</span>
                                        {/if}
                                        {#if !p.enabled}<span class="tag dim">disabled</span>{/if}
                                        <span class="grow"></span>
                                        <button class="btn btn-sm" onclick={() => toggleEnabled(p)}>
                                            {p.enabled ? "disable" : "enable"}
                                        </button>
                                    </div>
                                    <div class="prov-meta">
                                        <span class="kv">
                                            <b>models:</b>
                                            <span class="models">
                                                {p.models.length ? p.models.join(", ") : "-"}
                                            </span>
                                        </span>
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
                                    <div class="prov-actions">
                                        <button
                                            class="btn btn-sm"
                                            onclick={() => setActive(p)}
                                            disabled={settings?.activeProviderId === p.id}
                                        >
                                            Set active
                                        </button>
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

                        {#if provError}
                            <div class="err-msg">{provError}</div>
                        {/if}
                    {:else if tab === "general"}
                        <div class="section">
                            <div class="switch-row">
                                <Switch.Root class="switch" bind:checked={genStream}>
                                    <Switch.Thumb class="switch-thumb" />
                                </Switch.Root>
                                <span>Stream responses by default</span>
                            </div>

                            <div class="field">
                                <span class="lbl">Active provider</span>
                                <Select bind:value={genProviderId} items={providerOptions} />
                            </div>

                            <div class="field">
                                <span class="lbl">Active model</span>
                                <Select bind:value={genModel} items={modelOptions} />
                            </div>

                            {#if genError}
                                <div class="err-msg">{genError}</div>
                            {/if}

                            <div class="form-actions">
                                <button class="btn btn-primary" onclick={saveGeneral} disabled={genSaving}>
                                    {genSaving ? "Saving…" : "Save"}
                                </button>
                                {#if genSaved}<span class="ok-msg">✓ saved</span>{/if}
                            </div>
                        </div>
                    {:else if tab === "data"}
                        <div class="section">
                            <div class="stat">
                                {#if dataLoading}
                                    <span class="dim">loading…</span>
                                {:else}
                                    <span><b>{convos.length}</b> conversations</span>
                                {/if}
                            </div>

                            <button
                                class="btn btn-danger"
                                onclick={clearAll}
                                disabled={dataClearing || !convos.length}
                            >
                                {dataClearing ? "Deleting…" : "Clear all conversations"}
                            </button>

                            {#if dataError}
                                <div class="err-msg">{dataError}</div>
                            {/if}
                            {#if dataResult}
                                <div class="ok-msg">{dataResult}</div>
                            {/if}

                            <p class="note">
                                Provider keys configured as env are read from the server environment; inline
                                keys are stored in the server's data dir.
                            </p>
                        </div>
                    {/if}
            </div>
