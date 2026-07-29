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
