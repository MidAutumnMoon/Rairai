<script lang="ts">
    import { chat } from "../lib/chat.svelte";
    import Icon from "./ui/Icon.svelte";
    import Tooltip from "./ui/Tooltip.svelte";
</script>

<aside class="sidebar">
    <header class="pane-head">
        <span class="brand">Rairai</span>
        <Tooltip
            label="New chat"
            class="btn btn-icon btn-sm"
            onclick={() => chat.newConversation()}
        >
            <Icon name="plus" />
        </Tooltip>
    </header>
    <div class="convos">
        {#each chat.conversations as conv (conv.id)}
            <button
                class="convo"
                class:active={conv.id === chat.activeId}
                onclick={() => chat.open(conv.id)}
            >
                <span class="dot"></span>
                <span class="t">{conv.title}</span>
            </button>
        {/each}
    </div>
</aside>
