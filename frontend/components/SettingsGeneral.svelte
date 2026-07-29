<script lang="ts">
import { Switch } from "bits-ui";
import { getSettings, updateSettings } from "../lib/api.ts";
import type { Settings } from "../../shared/api.ts";
import { messageOf } from "../../shared/error.ts";

let stream = $state(false);
let saving = $state(false);
let saved = $state(false);
let error = $state<string | null>(null);

async function load() {
    try {
        const s = await getSettings();
        stream = s.defaultStream;
    } catch (e) {
        error = messageOf(e);
    }
}

$effect(() => {
    void load();
});

async function save() {
    saving = true;
    saved = false;
    error = null;
    try {
        const s = await updateSettings({ defaultStream: stream });
        stream = s.defaultStream;
        saved = true;
        setTimeout(() => (saved = false), 2500);
    } catch (e) {
        error = messageOf(e);
    } finally {
        saving = false;
    }
}
</script>

<div class="settings-content">
    <div class="section">
        <div class="switch-row">
            <Switch.Root class="switch" bind:checked={stream}>
                <Switch.Thumb class="switch-thumb" />
            </Switch.Root>
            <span>Stream responses by default</span>
        </div>

        {#if error}
            <div class="err-msg">{error}</div>
        {/if}

        <div class="form-actions">
            <button class="btn btn-primary" onclick={save} disabled={saving}>
                {saving ? "Saving…" : "Save"}
            </button>
            {#if saved}<span class="ok-msg">✓ saved</span>{/if}
        </div>
    </div>
</div>
