<script lang="ts">
    // Settings shell: a thin router over tab components. Each tab owns its state
    // + data loading (loading is scoped to when the tab mounts, since the shell
    // only renders the active tab). Splitting the tabs kills the deeply-nested
    // {#if} branches the old single-file Settings had.
    import SettingsProviders from "./SettingsProviders.svelte";
    import SettingsAssistants from "./SettingsAssistants.svelte";
    import SettingsGeneral from "./SettingsGeneral.svelte";
    import SettingsData from "./SettingsData.svelte";

    let { tab, focusAssistantId = null }: { tab: string; focusAssistantId?: string | null } = $props();
</script>

{#if tab === "providers"}
    <SettingsProviders />
{:else if tab === "assistants"}
    <SettingsAssistants {focusAssistantId} />
{:else if tab === "general"}
    <SettingsGeneral />
{:else if tab === "data"}
    <SettingsData />
{/if}
