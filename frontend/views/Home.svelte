<script lang="ts">
    import { appState } from "../lib/appState.svelte";

    // fetchApi returns a Promise; its three states (pending/fulfilled/rejected)
    // are exactly the invariant {#await} branches on below. No manual
    // loading/error/data flags to keep in sync - the Promise owns the invariant.
    async function fetchApi(): Promise<string> {
        const res = await fetch("/api");
        if (res.ok) {
            return await res.text();
        } else {
            throw new Error(`HTTP ${res.status}`);
        }
    }

    const api = fetchApi();
</script>

<h1>Home</h1>

<p>
    This is the home view. The counter below lives in shared app state, so it
    persists when you switch to About and back.
</p>

<p>Count: {appState.count}</p>
<button onclick={() => appState.increment()}>Increment</button>

<section>
    <h2>Server message</h2>

    {#await api}
        <p>Loading…</p>
    {:then message}
        <p>{message}</p>
    {:catch error}
        <p style="color: crimson">Error: {error.message}</p>
    {/await}
</section>
