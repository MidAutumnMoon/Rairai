<script lang="ts">
import { chat } from "$lib/chat.svelte";
import Icon from "$components/ui/Icon.svelte";
import Tooltip from "$components/ui/Tooltip.svelte";

let text = $state("");
let ta: HTMLTextAreaElement | undefined = $state();

// Extensible composer tools (bottom-left). Local toggle state only - not
// wired to the request yet; a future send path can read `activeTools`.
const composerTools = [
    { id: "reasoning", label: "Reasoning", icon: "lightbulb" },
    { id: "mcp", label: "MCP", icon: "plug" },
];
let activeTools = $state(new Set<string>());
function toggleTool(id: string) {
    const next = new Set(activeTools);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    activeTools = next;
}

function autosize() {
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
}

function send() {
    const t = text.trim();
    if (!t || chat.isStreaming) return;
    text = "";
    if (ta) ta.style.height = "auto";
    chat.sendMessage(t);
}

function onkeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
    }
}
</script>

<div class="composer-wrap">
    <div class="composer">
        <textarea
            bind:this={ta}
            bind:value={text}
            oninput={autosize}
            onkeydown={onkeydown}
            class="composer-input"
            placeholder="Message…  (Enter to send, Shift+Enter for newline)"
            rows="1"
            disabled={chat.isStreaming}
        ></textarea>

        <div class="composer-bar">
            <div class="composer-tools">
                {#each composerTools as t (t.id)}
                    <button
                        type="button"
                        class="composer-tool"
                        data-state={activeTools.has(t.id) ? "on" : "off"}
                        onclick={() => toggleTool(t.id)}
                    >
                        <Icon name={t.icon} size={15} />
                        {t.label}
                    </button>
                {/each}
            </div>

            <div class="composer-send">
                {#if chat.isStreaming}
                    <Tooltip label="Stop" class="composer-send-btn stop" onclick={() => chat.abort()}>
                        <Icon name="stop" size={16} />
                    </Tooltip>
                {:else}
                    <Tooltip
                        label="Send"
                        class="composer-send-btn"
                        onclick={send}
                        disabled={!text.trim()}
                    >
                        <Icon name="send" size={16} />
                    </Tooltip>
                {/if}
            </div>
        </div>
    </div>
</div>

<style>
    .composer-wrap {
        flex: none;
        padding: 0.6rem 0 0.75rem;
    }
    .composer {
        border: 1px solid var(--border-strong);
        border-radius: var(--r-lg);
        background: var(--surface);
        max-width: var(--content-w);
        margin-inline: auto;
        padding: 0.5rem 1.5rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        box-shadow: var(--shadow-sm);
        transition:
            border-color var(--transition),
            box-shadow var(--transition);
    }
    .composer:focus-within {
        border-color: var(--primary);
        box-shadow: 0 0 0 3px var(--primary-softer);
    }
    .composer-input {
        width: 100%;
        border: 0;
        background: transparent;
        resize: none;
        outline: none;
        padding: 0.5rem 0.3rem;
        max-height: 200px;
        font-size: 14px;
        line-height: 1.5;
        color: var(--text);
    }
    .composer-input::placeholder {
        color: var(--text-faint);
    }
    .composer-input:disabled {
        opacity: 0.6;
    }
    .composer-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
    }
    .composer-tools {
        display: flex;
        align-items: center;
        gap: 0.15rem;
        min-width: 0;
    }
    .composer-tool {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        height: 28px;
        padding: 0 0.55rem;
        border-radius: var(--r);
        font-size: 12px;
        color: var(--text-muted);
        background: transparent;
        transition:
            background var(--transition),
            color var(--transition);
        white-space: nowrap;
    }
    .composer-tool:hover {
        background: var(--surface-2);
        color: var(--text);
    }
    .composer-tool[data-state="on"] {
        background: var(--primary-soft);
        color: var(--primary);
    }
    .composer-send {
        display: flex;
        align-items: center;
        flex-shrink: 0;
    }
    .composer-send-btn {
        width: 32px;
        height: 32px;
        border-radius: var(--r-full);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: var(--primary);
        color: var(--primary-foreground);
        transition:
            background var(--transition),
            opacity var(--transition),
            transform var(--transition);
    }
    .composer-send-btn:hover {
        background: var(--primary-hover);
    }
    .composer-send-btn:active {
        transform: scale(0.94);
    }
    .composer-send-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
    .composer-send-btn.stop {
        background: var(--danger);
    }
    .composer-send-btn.stop:hover {
        background: var(--danger-hover);
    }
</style>
