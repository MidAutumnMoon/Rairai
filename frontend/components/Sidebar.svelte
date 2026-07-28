<script lang="ts">
    import { chat } from "../lib/chat.svelte";
    import Icon from "./ui/Icon.svelte";
    import Tooltip from "./ui/Tooltip.svelte";
    import AssistantEditor from "./AssistantEditor.svelte";

    let editorOpen = $state(false);
    let editingId = $state<string | null>(null);

    function newAssistant() {
        editingId = null;
        editorOpen = true;
    }
    function editActiveAssistant() {
        if (!chat.activeAssistantId) return;
        editingId = chat.activeAssistantId;
        editorOpen = true;
    }
</script>

<aside class="sidebar">
    <header class="pane-head">
        <span class="brand">Rairai</span>
        <Tooltip label="New assistant" class="btn btn-icon btn-sm" onclick={newAssistant}>
            <Icon name="plus" size={16} />
        </Tooltip>
    </header>

    <div class="assistants">
        {#each chat.assistants as a (a.id)}
            <button
                class="assistant"
                class:active={a.id === chat.activeAssistantId}
                onclick={() => chat.selectAssistant(a.id)}
                title={a.description || a.name}
            >
                <span class="emoji">{a.emoji}</span>
                <span class="a-name">{a.name}</span>
            </button>
        {/each}
    </div>

    <div class="convos-head">
        <span class="label">Chats</span>
        <div class="head-actions">
            <Tooltip
                label="Edit assistant"
                class="btn btn-icon btn-sm"
                onclick={editActiveAssistant}
                disabled={!chat.activeAssistantId}
            >
                <Icon name="settings" size={14} />
            </Tooltip>
            <Tooltip label="New chat" class="btn btn-icon btn-sm" onclick={() => chat.newConversation()}>
                <Icon name="plus" size={14} />
            </Tooltip>
        </div>
    </div>

    <div class="convos">
        {#each chat.conversations as conv (conv.id)}
            <button class="convo" class:active={conv.id === chat.activeId} onclick={() => chat.open(conv.id)}>
                <span class="dot"></span>
                <span class="t">{conv.title}</span>
            </button>
        {/each}
    </div>
</aside>

<AssistantEditor bind:open={editorOpen} assistantId={editingId} />
