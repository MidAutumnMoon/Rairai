<script lang="ts">
    import { chat } from "../lib/chat.svelte";
    import Icon from "./ui/Icon.svelte";
    import Tooltip from "./ui/Tooltip.svelte";

    let text = $state("");

    function send() {
        const t = text.trim();
        if (!t || chat.isStreaming) return;
        text = "";
        chat.sendMessage(t);
    }

    function onkeydown(e: KeyboardEvent) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
        }
    }
</script>

<div class="input-area">
    <textarea
        class="textarea"
        bind:value={text}
        onkeydown={onkeydown}
        placeholder="Message…  (Enter to send, Shift+Enter for newline)"
        rows="3"
        disabled={chat.isStreaming}
    ></textarea>
    <div class="actions">
        {#if chat.isStreaming}
            <Tooltip label="Stop" class="btn btn-icon stop" onclick={() => chat.abort()}>
                <Icon name="stop" />
            </Tooltip>
        {/if}
        <Tooltip
            label="Send"
            class="btn btn-icon btn-primary"
            onclick={send}
            disabled={chat.isStreaming || !text.trim()}
        >
            <Icon name="send" />
        </Tooltip>
    </div>
</div>
