<script lang="ts">
    import { appState } from "../lib/appState.svelte";
</script>

<h1>About</h1>

<p>Shared count is still: {appState.count} (set on Home).</p>

{#if appState.user}
    <p>Logged in as <strong>{appState.user.name}</strong></p>
    <button onclick={() => appState.logout()}>Log out</button>
{:else}
    <button onclick={() => appState.login("demo")}>Log in as demo</button>
{/if}
