<script lang="ts">
// The connection form (name, API type, base URL, credential source + key,
// enabled). Extracted from Providers.svelte because the identical markup
// was duplicated across the "new" and "edit" branches - the duplication was
// the root cause of the indentation bloat. Both branches now render this.
import { ToggleGroup } from "bits-ui";
import type { ApiType } from "$shared/api.ts";
import Select from "$components/ui/Select.svelte";

export type FormState = {
    name: string;
    apiType: ApiType;
    baseUrl: string;
    credSource: "env" | "inline";
    credRef: string;
    key: string;
    enabled: boolean;
};

let {
    form = $bindable(),
    apiTypeOptions,
    isEdit = false,
    error = null,
    saving = false,
    onsave,
}: {
    form: FormState;
    apiTypeOptions: { value: string; label: string }[];
    isEdit?: boolean;
    error?: string | null;
    saving?: boolean;
    onsave: () => void;
} = $props();
</script>

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
                        {#if isEdit}<span class="hint">(leave blank to keep existing)</span>{/if}
                    </span>
                    <input
                        class="input"
                        type="password"
                        bind:value={form.key}
                        placeholder={isEdit ? "••••••••" : "sk-..."}
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
    {#if error}
        <div class="err-msg">{error}</div>
    {/if}
    <div class="form-actions">
        <button class="btn btn-primary" onclick={onsave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
        </button>
    </div>
</section>
