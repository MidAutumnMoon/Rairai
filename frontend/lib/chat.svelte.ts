// Chat store + SSE client. The frontend owns the conversation state (persisted
// to localStorage later); each send POSTs the history to /api/chat and applies
// the streamed ServerEvents to the active conversation + the network log.
//
// Svelte 5 runes live in a `.svelte.ts` module: $state on class fields makes
// them deeply reactive (mutating nested messages/arrays updates the UI).

import type {
    ChatMessage,
    ChatRequest,
    NetworkLog,
    ServerEvent,
} from "../../shared/chat-events.ts";

export interface Conversation {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: number;
}

function uid(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const SYSTEM_PROMPT = "You are a helpful assistant.";

/** Stream ServerEvents from POST /api/chat by parsing the SSE wire format. */
async function streamChat(
    req: ChatRequest,
    onEvent: (e: ServerEvent) => void,
    signal: AbortSignal,
): Promise<void> {
    const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req),
        signal,
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE frames are separated by a blank line (\n\n).
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) >= 0) {
            const frame = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            const line = frame.trim();
            if (line.startsWith("data: ")) {
                try {
                    onEvent(JSON.parse(line.slice(6)) as ServerEvent);
                } catch {
                    // ignore malformed frames (partial flushes)
                }
            }
        }
    }
}

class ChatStore {
    conversations = $state<Conversation[]>([]);
    activeId = $state<string | null>(null);
    networkLogs = $state<NetworkLog[]>([]);
    isStreaming = $state(false);
    streamError = $state<string | null>(null);
    /** id of the assistant message currently being streamed (for the view). */
    streamingMessageId = $state<string | null>(null);
    private abortCtl: AbortController | null = null;

    get active(): Conversation | null {
        return this.conversations.find((c) => c.id === this.activeId) ?? null;
    }

    newConversation(): void {
        const conv: Conversation = {
            id: uid("conv"),
            title: "New chat",
            messages: [],
            createdAt: Date.now(),
        };
        this.conversations.push(conv);
        this.activeId = conv.id;
    }

    select(id: string): void {
        this.activeId = id;
    }

    async sendMessage(text: string): Promise<void> {
        const trimmed = text.trim();
        if (!trimmed || this.isStreaming) return;

        let conv = this.active;
        if (!conv) {
            this.newConversation();
            conv = this.active!;
        }

        const userMsg: ChatMessage = {
            id: uid("msg"),
            role: "user",
            text: trimmed,
            createdAt: Date.now(),
        };
        conv.messages.push(userMsg);
        if (conv.title === "New chat") conv.title = trimmed.slice(0, 48);

        // Placeholder assistant message that we mutate as deltas arrive.
        const streamMsg: ChatMessage = {
            id: uid("msg"),
            role: "assistant",
            text: "",
            reasoning: "",
            createdAt: Date.now(),
        };
        conv.messages.push(streamMsg);

        const req: ChatRequest = {
            // history incl. the new user message, excl. the streaming placeholder
            messages: conv.messages.slice(0, -1),
            systemPrompt: SYSTEM_PROMPT,
        };

        this.isStreaming = true;
        this.streamError = null;
        this.streamingMessageId = streamMsg.id;
        this.abortCtl = new AbortController();
        try {
            await streamChat(req, (ev) => this.applyEvent(streamMsg.id, ev), this.abortCtl.signal);
        } catch (e) {
            if (!this.streamError) this.streamError = e instanceof Error ? e.message : String(e);
        } finally {
            this.isStreaming = false;
            this.streamingMessageId = null;
            this.abortCtl = null;
        }
    }

    private applyEvent(streamMsgId: string, ev: ServerEvent): void {
        const conv = this.active;
        if (!conv) return;
        const msg = conv.messages.find((m) => m.id === streamMsgId);
        switch (ev.type) {
            case "text":
                if (msg) msg.text += ev.delta;
                break;
            case "reasoning":
                if (msg) msg.reasoning = (msg.reasoning ?? "") + ev.delta;
                break;
            case "tool_call":
                if (msg) {
                    if (!msg.toolCalls) msg.toolCalls = [];
                    const idx = msg.toolCalls.findIndex((t) => t.id === ev.toolCall.id);
                    if (idx >= 0) msg.toolCalls[idx] = ev.toolCall;
                    else msg.toolCalls.push(ev.toolCall);
                }
                break;
            case "network_log":
                this.networkLogs.unshift(ev.log);
                break;
            case "done": {
                // Replace the placeholder with the finalized message (keep the id
                // so the view doesn't remount; carry over any streamed reasoning
                // the server may have omitted from `done`).
                const i = conv.messages.findIndex((m) => m.id === streamMsgId);
                if (i >= 0) {
                    const final = ev.message;
                    conv.messages[i] = {
                        ...final,
                        id: streamMsgId,
                        reasoning: final.reasoning ?? msg?.reasoning,
                    };
                }
                break;
            }
            case "error":
                this.streamError = ev.message;
                break;
        }
    }

    abort(): void {
        this.abortCtl?.abort();
    }

    clearLogs(): void {
        this.networkLogs = [];
    }
}

export const chat = new ChatStore();
