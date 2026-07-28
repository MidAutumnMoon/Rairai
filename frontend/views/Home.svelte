<script lang="ts">
    import { appState } from "../lib/appState.svelte";
</script>

<h1>Home</h1>

<p>
    This is the home view. The counter below lives in shared app state, so it
    persists when you switch to About and back.
</p>

<p>Count: {appState.count}</p>
<button onclick={() => appState.increment()}>Increment</button>
