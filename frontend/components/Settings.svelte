<script lang="ts">
    import {
        listProviders,
        createProvider,
        updateProvider,
        deleteProvider,
        testProvider,
        getSettings,
        updateSettings,
        listConversations,
        deleteConversation,
    } from "../lib/api.ts";
    import type { Provider, ProviderInput, Settings, ApiType } from "../../shared/api.ts";
    import type { ConversationSummary } from "../../shared/api.ts";

    let { onClose }: { onClose?: () => void } = $props();

    let tab = $state<"providers" | "general" | "data">("providers");

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

    // --- General tab state ---
    let genProviders = $state<Provider[]>([]);
    let genPrompt = $state("");
    let genStream = $state(false);
    let genProviderId = $state("");
    let genModel = $state("");
    let genSaving = $state(false);
    let genSaved = $state(false);
    let genError = $state<string | null>(null);
    const genModels = $derived(
        genProviders.find((p) => p.id === genProviderId)?.models ?? [],
    );

    // --- Data tab state ---
    let convos = $state<ConversationSummary[]>([]);
    let dataLoading = $state(false);
    let dataClearing = $state(false);
    let dataError = $state<string | null>(null);
    let dataResult = $state<string | null>(null);

    // --- helpers ---
    function errMsg(e: unknown): string {
        return e instanceof Error ? e.message : String(e);
    }

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
            provError = errMsg(e);
        } finally {
            loadingProviders = false;
        }
    }

    async function loadSettings() {
        try {
            settings = await getSettings();
        } catch (e) {
            provError = errMsg(e);
        }
    }

    async function loadGeneral() {
        genError = null;
        try {
            const [s, ps] = await Promise.all([getSettings(), listProviders()]);
            settings = s;
            genProviders = ps;
            genPrompt = s.defaultSystemPrompt;
            genStream = s.defaultStream;
            genProviderId = s.activeProviderId ?? "";
            genModel = s.activeModel ?? "";
        } catch (e) {
            genError = errMsg(e);
        }
    }

    async function loadData() {
        dataLoading = true;
        dataError = null;
        try {
            convos = await listConversations();
        } catch (e) {
            dataError = errMsg(e);
        } finally {
            dataLoading = false;
        }
    }

    // --- effects ---
    // Load the Providers-tab data once on mount.
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
            formError = errMsg(e);
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
            provError = errMsg(e);
        }
    }

    async function setActive(p: Provider) {
        try {
            settings = await updateSettings({
                activeProviderId: p.id,
                activeModel: p.models[0] ?? null,
            });
        } catch (e) {
            provError = errMsg(e);
        }
    }

    async function testP(p: Provider) {
        tests[p.id] = "testing";
        try {
            tests[p.id] = await testProvider(p.id);
        } catch (e) {
            tests[p.id] = { ok: false, error: errMsg(e) };
        }
    }

    async function removeProvider(p: Provider) {
        if (!confirm(`Delete provider "${p.name}"?`)) return;
        try {
            await deleteProvider(p.id);
            if (settings?.activeProviderId === p.id) await loadSettings();
            await loadProviders();
        } catch (e) {
            provError = errMsg(e);
        }
    }

    // --- general actions ---
    async function saveGeneral() {
        genSaving = true;
        genError = null;
        genSaved = false;
        try {
            const patch: Partial<Settings> = {
                defaultSystemPrompt: genPrompt,
                defaultStream: genStream,
                activeProviderId: genProviderId || null,
                activeModel: genModel || null,
            };
            const s = await updateSettings(patch);
            settings = s;
            genPrompt = s.defaultSystemPrompt;
            genStream = s.defaultStream;
            genProviderId = s.activeProviderId ?? "";
            genModel = s.activeModel ?? "";
            genSaved = true;
            setTimeout(() => {
                genSaved = false;
            }, 2500);
        } catch (e) {
            genError = errMsg(e);
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
        let ok = 0;
        let fail = 0;
        const snapshot = [...convos];
        for (const c of snapshot) {
            try {
                await deleteConversation(c.id);
                ok++;
            } catch {
                fail++;
            }
        }
        await loadData();
        dataResult = `Deleted ${ok} conversation${ok === 1 ? "" : "s"}${
            fail ? `, ${fail} failed` : ""
        }.`;
        dataClearing = false;
    }
</script>

<section class="settings">
    <header class="pane-head">
        <div class="head-left">
            {#if onClose}
                <button onclick={onClose}>← Back</button>
            {/if}
            <span class="title">Settings</span>
        </div>
    </header>

    <nav class="tabs">
        <button class="tab" class:active={tab === "providers"} onclick={() => (tab = "providers")}>
            Providers
        </button>
        <button class="tab" class:active={tab === "general"} onclick={() => (tab = "general")}>
            General
        </button>
        <button class="tab" class:active={tab === "data"} onclick={() => (tab = "data")}>
            Data
        </button>
    </nav>

    <div class="body">
        {#if tab === "providers"}
            <div class="toolbar">
                <span class="count">
                    {providers.length} provider{providers.length === 1 ? "" : "s"}
                </span>
                <span class="spacer"></span>
                <button class="primary" onclick={openNew}>+ New provider</button>
            </div>

            {#if formOpen}
                <div class="form-card">
                    <div class="form-head">
                        <span>{editingId ? "Edit provider" : "New provider"}</span>
                        <button class="mini" onclick={closeForm} title="Close">✕</button>
                    </div>

                    <div class="grid">
                        <label class="field">
                            <span class="lbl">Name</span>
                            <input bind:value={form.name} placeholder="My OpenAI" />
                        </label>
                        <label class="field">
                            <span class="lbl">API type</span>
                            <select bind:value={form.apiType}>
                                <option value="openai-completions">openai-completions</option>
                                <option value="openai-responses">openai-responses</option>
                                <option value="anthropic-messages">anthropic-messages</option>
                            </select>
                        </label>
                        <label class="field wide">
                            <span class="lbl">
                                Base URL <span class="hint">must include /v1 for openai-*</span>
                            </span>
                            <input bind:value={form.baseUrl} placeholder="https://api.openai.com/v1" />
                        </label>
                        <label class="field wide">
                            <span class="lbl">Models <span class="hint">comma-separated</span></span>
                            <input bind:value={form.modelsText} placeholder="gpt-4o-mini, gpt-4o" />
                        </label>
                        <div class="field wide">
                            <span class="lbl">Credential source</span>
                            <div class="seg">
                                <button
                                    class:sel={form.credSource === "env"}
                                    onclick={() => (form.credSource = "env")}
                                >
                                    env var
                                </button>
                                <button
                                    class:sel={form.credSource === "inline"}
                                    onclick={() => (form.credSource = "inline")}
                                >
                                    inline key
                                </button>
                            </div>
                            {#if form.credSource === "env"}
                                <label class="sub">
                                    <span class="lbl">Env var name</span>
                                    <input
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
                        <button class="primary" onclick={saveProvider} disabled={formSaving}>
                            {formSaving ? "Saving…" : "Save"}
                        </button>
                        <button onclick={closeForm} disabled={formSaving}>Cancel</button>
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
                            {#if !p.enabled}
                                <span class="tag dim">disabled</span>
                            {/if}
                            <span class="grow"></span>
                            <button class="mini" onclick={() => toggleEnabled(p)}>
                                {p.enabled ? "disable" : "enable"}
                            </button>
                        </div>
                        <div class="prov-meta">
                            <span class="kv">
                                <b>models:</b>
                                <span class="models">
                                    {p.models.length ? p.models.join(", ") : "—"}
                                </span>
                            </span>
                            <span class="kv"><b>cred:</b> {credLabel(p)}</span>
                            <span class="kv"><b>base:</b> {p.baseUrl || "—"}</span>
                        </div>
                        {#if tv}
                            <div
                                class="test-result {tv.state}"
                            >
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
                                class="mini"
                                onclick={() => setActive(p)}
                                disabled={settings?.activeProviderId === p.id}
                            >
                                Set active
                            </button>
                            <button class="mini" onclick={() => testP(p)}>Test</button>
                            <button class="mini" onclick={() => openEdit(p)}>Edit</button>
                            <button class="mini danger" onclick={() => removeProvider(p)}>
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
                <label class="field">
                    <span class="lbl">Default system prompt</span>
                    <textarea
                        bind:value={genPrompt}
                        rows="4"
                        placeholder="You are a helpful assistant."
                    ></textarea>
                </label>

                <label class="check">
                    <input type="checkbox" bind:checked={genStream} />
                    <span>Stream responses by default</span>
                </label>

                <label class="field">
                    <span class="lbl">Active provider</span>
                    <select bind:value={genProviderId}>
                        <option value="">— none —</option>
                        {#each genProviders as p (p.id)}
                            <option value={p.id}>{p.name}</option>
                        {/each}
                    </select>
                </label>

                <label class="field">
                    <span class="lbl">Active model</span>
                    <select bind:value={genModel}>
                        <option value="">— none —</option>
                        {#each genModels as m}
                            <option value={m}>{m}</option>
                        {/each}
                    </select>
                </label>

                {#if genError}
                    <div class="err-msg">{genError}</div>
                {/if}

                <div class="form-actions">
                    <button class="primary" onclick={saveGeneral} disabled={genSaving}>
                        {genSaving ? "Saving…" : "Save"}
                    </button>
                    {#if genSaved}<span class="ok-msg">✓ saved</span>{/if}
                </div>
            </div>
        {:else}
            <div class="section">
                <div class="stat">
                    {#if dataLoading}
                        <span class="dim">loading…</span>
                    {:else}
                        <span><b>{convos.length}</b> conversations</span>
                    {/if}
                </div>

                <button class="danger" onclick={clearAll} disabled={dataClearing || !convos.length}>
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
</section>

<style>
    .settings {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        background: var(--bg);
        color-scheme: dark;
    }
    .head-left {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .tabs {
        display: flex;
        border-bottom: 1px solid var(--border);
        background: var(--bg-elev);
        flex-shrink: 0;
    }
    .tab {
        padding: 0.5rem 0.95rem;
        font-size: 13px;
        color: var(--text-dim);
        border-bottom: 2px solid transparent;
        border-radius: 0;
    }
    .tab:hover {
        color: var(--text);
    }
    .tab.active {
        color: var(--text);
        border-bottom-color: var(--accent);
    }

    .body {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 0.9rem;
    }

    /* buttons */
    .mini,
    .primary,
    .danger {
        background: var(--bg-elev2);
        border: 1px solid var(--border);
        border-radius: 4px;
        padding: 0.25rem 0.6rem;
        font-size: 12px;
        color: var(--text-dim);
    }
    .mini:hover,
    .primary:hover,
    .danger:hover {
        border-color: var(--accent);
        color: var(--text);
    }
    .primary {
        background: var(--accent-dim);
        border-color: var(--accent);
        color: var(--text);
    }
    .primary:hover {
        background: var(--accent);
    }
    .danger {
        color: var(--err);
    }
    .danger:hover {
        border-color: var(--err);
        color: var(--err);
    }
    .mini:disabled,
    .primary:disabled,
    .danger:disabled {
        opacity: 0.5;
        cursor: default;
    }

    .toolbar {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        margin-bottom: 0.7rem;
    }
    .toolbar .count {
        color: var(--text-faint);
        font-size: 12px;
    }
    .toolbar .spacer {
        flex: 1;
    }

    /* provider cards */
    .prov {
        border: 1px solid var(--border);
        border-radius: 6px;
        background: var(--bg-elev);
        padding: 0.55rem 0.7rem;
        margin-bottom: 0.5rem;
    }
    .prov.active {
        border-color: var(--accent);
    }
    .prov-top {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
    }
    .pname {
        font-weight: 600;
    }
    .badge {
        font-family: var(--mono);
        font-size: 11px;
        padding: 0.05rem 0.35rem;
        border-radius: 3px;
        background: var(--bg-elev2);
        color: var(--text-dim);
        border: 1px solid var(--border);
    }
    .tag {
        font-size: 10px;
        padding: 0.05rem 0.3rem;
        border-radius: 3px;
        background: var(--accent-dim);
        color: var(--text);
    }
    .tag.dim {
        background: var(--bg-elev2);
        color: var(--text-faint);
    }
    .grow {
        flex: 1;
    }
    .prov-meta {
        display: flex;
        gap: 1rem;
        flex-wrap: wrap;
        margin: 0.35rem 0;
        font-size: 12px;
        color: var(--text-dim);
    }
    .kv b {
        color: var(--text-faint);
        font-weight: 500;
    }
    .models {
        font-family: var(--mono);
    }
    .prov-actions {
        display: flex;
        gap: 0.4rem;
        flex-wrap: wrap;
    }
    .test-result {
        font-size: 12px;
        padding: 0.25rem 0.4rem;
        margin-top: 0.35rem;
        border-radius: 4px;
        background: var(--bg-elev2);
    }
    .test-result.testing {
        color: var(--warn);
    }
    .test-result.ok {
        color: var(--ok);
    }
    .test-result.err {
        color: var(--err);
    }

    /* form */
    .form-card {
        border: 1px solid var(--accent);
        border-radius: 6px;
        background: var(--bg-elev);
        padding: 0.7rem 0.85rem;
        margin-bottom: 0.8rem;
    }
    .form-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-weight: 600;
        margin-bottom: 0.6rem;
    }
    .grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.6rem 0.9rem;
    }
    .field {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        margin-bottom: 0.6rem;
    }
    .field.wide {
        grid-column: 1 / -1;
    }
    .field.check,
    .check {
        flex-direction: row;
        align-items: center;
        gap: 0.4rem;
    }
    .lbl {
        font-size: 12px;
        color: var(--text-dim);
    }
    .hint {
        color: var(--text-faint);
        font-size: 11px;
        font-weight: 400;
    }
    input,
    textarea,
    select {
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 4px;
        padding: 0.3rem 0.45rem;
        font-size: 13px;
        color: var(--text);
        width: 100%;
    }
    textarea {
        resize: vertical;
        font-family: var(--sans);
    }
    input:focus,
    textarea:focus,
    select:focus {
        outline: none;
        border-color: var(--accent);
    }
    .sub {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        margin-top: 0.45rem;
    }
    .seg {
        display: inline-flex;
        border: 1px solid var(--border);
        border-radius: 4px;
        overflow: hidden;
        width: max-content;
    }
    .seg button {
        background: var(--bg);
        padding: 0.3rem 0.7rem;
        font-size: 12px;
        color: var(--text-dim);
        border: none;
        border-right: 1px solid var(--border);
    }
    .seg button:last-child {
        border-right: none;
    }
    .seg button.sel {
        background: var(--accent-dim);
        color: var(--text);
    }
    .form-actions {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        margin-top: 0.6rem;
    }
    .err-msg {
        color: var(--err);
        font-size: 12px;
        margin-top: 0.4rem;
    }
    .ok-msg {
        color: var(--ok);
        font-size: 12px;
    }
    .empty {
        color: var(--text-faint);
        font-size: 13px;
        padding: 1rem 0;
    }
    .dim {
        color: var(--text-faint);
    }

    /* general / data sections */
    .section {
        border: 1px solid var(--border);
        border-radius: 6px;
        background: var(--bg-elev);
        padding: 0.75rem 0.9rem;
    }
    .stat {
        font-size: 14px;
        margin-bottom: 0.7rem;
    }
    .stat b {
        font-size: 18px;
    }
    .note {
        color: var(--text-faint);
        font-size: 12px;
        margin-top: 0.9rem;
        line-height: 1.5;
    }

    @media (max-width: 560px) {
        .grid {
            grid-template-columns: 1fr;
        }
    }
</style>
