// Chat store + SSE client, now server-backed. The backend owns conversations
// (persisted in SQLite); this store is a cache/view: it loads the conversation
// list, opens one fully (with messages), and sends {conversationId, text} per
// turn - never the full history. Streamed events mutate the active message.
//
// Svelte 5 runes: $state on class fields makes them deeply reactive.

import type {
    ChatMessage,
    ChatRequest,
    NetworkLog,
    ServerEvent,
} from "../../shared/chat-events.ts";
import type { Conversation, ConversationSummary } from "../../shared/api.ts";
import {
    createConversation,
    deleteConversation,
    getConversation,
    getMessagesBefore,
    listConversations,
} from "./api.ts";
import { uid } from "../../shared/id.ts";
import { messageOf } from "../../shared/error.ts";

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
    conversations = $state<ConversationSummary[]>([]);
    activeId = $state<string | null>(null);
    activeConversation = $state<Conversation | null>(null);
    networkLogs = $state<NetworkLog[]>([]);
    isStreaming = $state(false);
    streamError = $state<string | null>(null);
    streamingMessageId = $state<string | null>(null);
    private abortCtl: AbortController | null = null;

    get active(): Conversation | null {
        return this.activeConversation;
    }

    /** Load the conversation list; open the most recent, or start a new one. */
    async init(): Promise<void> {
        await this.loadConversations();
        if (this.conversations.length) {
            await this.open(this.conversations[0].id);
        } else {
            await this.newConversation();
        }
    }

    async loadConversations(): Promise<void> {
        this.conversations = await listConversations();
    }

    async open(id: string): Promise<void> {
        if (this.isStreaming) this.abort();
        this.activeId = id;
        this.activeConversation = await getConversation(id);
        // Fresh view: drop in-flight streaming state and per-conversation logs.
        this.isStreaming = false;
        this.streamingMessageId = null;
        this.streamError = null;
        this.networkLogs = [];
    }

    async loadOlder(): Promise<void> {
        const conv = this.activeConversation;
        if (!conv || !conv.hasMore || conv.oldestSeq == null) return;
        const page = await getMessagesBefore(conv.id, conv.oldestSeq);
        // Older messages go in front; preserve ascending order.
        conv.messages = [...page.messages, ...conv.messages];
        conv.hasMore = page.hasMore;
        conv.oldestSeq = page.oldestSeq;
    }

    async newConversation(): Promise<void> {
        const conv = await createConversation({});
        this.activeConversation = conv;
        this.activeId = conv.id;
        await this.loadConversations();
    }

    async deleteConversation(id: string): Promise<void> {
        await deleteConversation(id);
        if (this.activeId === id) {
            this.activeConversation = null;
            this.activeId = null;
        }
        await this.loadConversations();
        if (!this.activeId && this.conversations.length) {
            await this.open(this.conversations[0].id);
        } else if (!this.conversations.length) {
            await this.newConversation();
        }
    }

    async sendMessage(text: string): Promise<void> {
        const trimmed = text.trim();
        if (!trimmed || this.isStreaming) return;

        let conv = this.activeConversation;
        if (!conv) {
            conv = await createConversation({});
            this.activeConversation = conv;
            this.activeId = conv.id;
        }

        // Optimistic user message (temp id; reconciled to a server id on reload).
        const userMsg: ChatMessage = {
            id: uid("local"),
            role: "user",
            text: trimmed,
            createdAt: Date.now(),
        };
        conv.messages.push(userMsg);

        // Placeholder assistant message mutated as deltas arrive.
        const streamMsg: ChatMessage = {
            id: uid("local"),
            role: "assistant",
            text: "",
            reasoning: "",
            createdAt: Date.now(),
        };
        conv.messages.push(streamMsg);

        this.isStreaming = true;
        this.streamError = null;
        this.streamingMessageId = streamMsg.id;
        this.abortCtl = new AbortController();
        try {
            await streamChat(
                { conversationId: conv.id, text: trimmed },
                (ev) => this.applyEvent(streamMsg.id, ev),
                this.abortCtl.signal,
            );
        } catch (e) {
            const aborted = e instanceof DOMException && e.name === "AbortError";
            if (!aborted && !this.streamError) {
                this.streamError = messageOf(e);
            }
        } finally {
            // Drop an assistant placeholder that never received content (e.g. aborted).
            const conv = this.activeConversation;
            if (conv) {
                const i = conv.messages.findIndex((m) => m.id === streamMsg.id);
                if (i >= 0) {
                    const m = conv.messages[i];
                    if (!m.text && !m.reasoning && !(m.toolCalls && m.toolCalls.length)) {
                        conv.messages.splice(i, 1);
                    }
                }
            }
            this.isStreaming = false;
            this.streamingMessageId = null;
            this.abortCtl = null;
            await this.loadConversations();
        }
    }

    private applyEvent(streamMsgId: string, ev: ServerEvent): void {
        const conv = this.activeConversation;
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
                // Replace the placeholder with the server-persisted message.
                const i = conv.messages.findIndex((m) => m.id === streamMsgId);
                if (i >= 0) {
                    const final = ev.message;
                    conv.messages[i] = {
                        ...final,
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

    async clearAllConversations(): Promise<void> {
        const ids = this.conversations.map((c) => c.id);
        for (const id of ids) {
            try {
                await deleteConversation(id);
            } catch {
                // ignore individual failures, continue clearing the rest
            }
        }
        this.activeConversation = null;
        this.activeId = null;
        this.networkLogs = [];
        this.isStreaming = false;
        this.streamingMessageId = null;
        await this.loadConversations();
        await this.newConversation();
    }
}

export const chat = new ChatStore();
