<script lang="ts">
    import { chat } from "../lib/chat.svelte";

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
        bind:value={text}
        onkeydown={onkeydown}
        placeholder="Message…  (Enter to send, Shift+Enter for newline)"
        rows="3"
        disabled={chat.isStreaming}
    ></textarea>
    <div class="actions">
        {#if chat.isStreaming}
            <button class="stop" onclick={() => chat.abort()}>Stop</button>
        {/if}
        <button class="send" onclick={send} disabled={chat.isStreaming || !text.trim()}>
            Send
        </button>
    </div>
</div>

<style>
    .input-area {
        border-top: 1px solid var(--border);
        background: var(--bg-elev);
        padding: 0.6rem 0.85rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    textarea {
        width: 100%;
        resize: none;
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 0.55rem 0.7rem;
        color: var(--text);
        outline: none;
    }
    textarea:focus {
        border-color: var(--accent);
    }
    textarea:disabled {
        opacity: 0.6;
    }
    .actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
    }
    .actions button {
        border: 1px solid var(--border);
        border-radius: 5px;
        padding: 0.35rem 0.9rem;
        background: var(--bg-elev2);
    }
    .send {
        color: var(--text);
    }
    .send:not(:disabled):hover {
        border-color: var(--accent);
    }
    .send:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }
    .stop {
        color: var(--err);
        border-color: var(--err) !important;
    }
</style>
