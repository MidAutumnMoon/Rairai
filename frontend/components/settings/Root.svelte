<script lang="ts">
    // Settings shell: a thin router over tab components. Each tab owns its state
    // + data loading (loading is scoped to when the tab mounts, since the shell
    // only renders the active tab). Splitting the tabs kills the deeply-nested
    // {#if} branches the old single-file Settings had.
    import SettingsProviders from "./Providers.svelte";
    import SettingsAssistants from "./Assistants.svelte";
    import SettingsGeneral from "./General.svelte";
    import SettingsData from "./Data.svelte";

    interface Props {
        tab: string;
        focusAssistantId?: string | null;
    }

    let {
        tab,
        focusAssistantId = null,
    }: Props = $props();
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
