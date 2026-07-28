<script lang="ts">
    import Home from "./views/Home.svelte";
    import About from "./views/About.svelte";

    type ViewId = "home" | "about";

    const views = { home: Home, about: About } as const;

    const navItems: { id: ViewId; label: string }[] = [
        { id: "home", label: "Home" },
        { id: "about", label: "About" },
    ];

    let currentView = $state<ViewId>("home");
</script>

<nav>
    {#each navItems as item (item.id)}
        <button
            class:active={currentView === item.id}
            onclick={() => (currentView = item.id)}
        >
            {item.label}
        </button>
    {/each}
</nav>

<main>
    {const ActiveView = $derived(views[currentView])}
    <ActiveView />
</main>

<style>
    nav {
        display: flex;
        gap: 0.5rem;
        padding: 0.5rem;
        border-bottom: 1px solid #ccc;

        button {
            cursor: pointer;
            padding: 0.25rem 0.75rem;
            border: 1px solid transparent;
            border-radius: 4px;
            background: none;
            font: inherit;
        }
    }
    nav button.active {
        border-color: #333;
    }
</style>
