// Conversation + message persistence: list, page (tail + cursor pagination),
// create, title, delete, add message.

import type {
    Conversation,
    ConversationCreate,
    ConversationSummary,
    MessagePage,
} from "../../shared/api.ts";
import { ConversationSummarySchema } from "../../shared/api.ts";
import {
    type ChatMessage,
    ChatMessageSchema,
} from "../../shared/chat-events.ts";
import { uid } from "../../shared/id.ts";
import { query, queryOne, run } from "./client.ts";

interface ConvRow {
    id: string;
    title: string;
    created_at: number;
    updated_at: number;
    assistant_id: string | null;
    provider_id: string | null;
    model: string | null;
}

function rowToSummary(r: ConvRow, messageCount: number): ConversationSummary {
    return ConversationSummarySchema.parse({
        id: r.id,
        title: r.title,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        assistantId: r.assistant_id,
        providerId: r.provider_id,
        model: r.model,
        messageCount,
    });
}

export function listConversations(assistantId?: string): ConversationSummary[] {
    const rows = assistantId
        ? query<ConvRow>(
            "SELECT * FROM conversations WHERE assistant_id = ? ORDER BY updated_at DESC",
            assistantId,
        )
        : query<ConvRow>(
            "SELECT * FROM conversations ORDER BY updated_at DESC",
        );
    const counts = query<{ conversation_id: string; n: number }>(
        "SELECT conversation_id, COUNT(*) AS n FROM messages GROUP BY conversation_id",
    );
    const countMap = new Map(counts.map((c) => [c.conversation_id, c.n]));
    return rows.map((r) => rowToSummary(r, countMap.get(r.id) ?? 0));
}

interface MsgRow {
    id: string;
    conversation_id: string;
    seq: number;
    role: string;
    text: string;
    reasoning: string | null;
    tool_calls: string | null;
    model: string | null;
    usage: string | null;
    duration_ms: number | null;
    created_at: number;
}

function rowToMessage(r: MsgRow): ChatMessage {
    return ChatMessageSchema.parse({
        id: r.id,
        role: r.role,
        text: r.text,
        reasoning: r.reasoning ?? undefined,
        toolCalls: r.tool_calls ? JSON.parse(r.tool_calls) : undefined,
        model: r.model ?? undefined,
        usage: r.usage ? JSON.parse(r.usage) : undefined,
        durationMs: r.duration_ms ?? undefined,
        createdAt: r.created_at,
    });
}

export function getConversation(id: string): Conversation | null {
    const r = queryOne<ConvRow>("SELECT * FROM conversations WHERE id = ?", id);
    if (!r) return null;
    const msgs = query<MsgRow>(
        "SELECT * FROM messages WHERE conversation_id = ? ORDER BY seq ASC",
        id,
    );
    const summary = rowToSummary(r, msgs.length);
    return {
        ...summary,
        messages: msgs.map(rowToMessage),
        hasMore: false,
        oldestSeq: null,
    };
}

const PAGE_SIZE = 30;

/** Conversation meta + the recent message tail (NOT all messages). Used by the
 *  REST endpoint so opening a long conversation doesn't transfer everything. */
export function getConversationPage(
    id: string,
    limit = PAGE_SIZE,
): Conversation | null {
    const r = queryOne<ConvRow>("SELECT * FROM conversations WHERE id = ?", id);
    if (!r) return null;
    const total = queryOne<{ n: number }>(
        "SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?",
        id,
    )!.n;
    // Tail: newest N, then reverse to ascending for display.
    const tail = query<MsgRow>(
        "SELECT * FROM messages WHERE conversation_id = ? ORDER BY seq DESC LIMIT ?",
        id,
        limit,
    );
    const messages = tail.slice().reverse().map(rowToMessage);
    const oldestSeq = tail.length ? tail[tail.length - 1].seq : null;
    return {
        ...rowToSummary(r, total),
        messages,
        hasMore: total > tail.length,
        oldestSeq,
    };
}

/** One page of messages older than `beforeSeq` (cursor pagination on scroll-up). */
export function getMessagesBefore(
    id: string,
    beforeSeq: number,
    limit = PAGE_SIZE,
): MessagePage {
    const total = queryOne<{ n: number }>(
        "SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND seq < ?",
        id,
        beforeSeq,
    )!.n;
    const rows = query<MsgRow>(
        "SELECT * FROM messages WHERE conversation_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?",
        id,
        beforeSeq,
        limit,
    );
    const messages = rows.slice().reverse().map(rowToMessage);
    const oldestSeq = rows.length ? rows[rows.length - 1].seq : null;
    return { messages, hasMore: total > rows.length, oldestSeq };
}

/** Default title given to a new conversation; runChat auto-titles when this is still set. */
export const NEW_CHAT_TITLE = "New chat";

export function createConversation(input: ConversationCreate): Conversation {
    const id = uid("conv");
    const now = Date.now();
    run(
        `INSERT INTO conversations (id, title, created_at, updated_at, assistant_id, provider_id, model)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        id,
        input.title?.trim() || NEW_CHAT_TITLE,
        now,
        now,
        input.assistantId ?? null,
        input.providerId ?? null,
        input.model ?? null,
    );
    return getConversation(id)!;
}

export function updateConversationTitle(id: string, title: string): void {
    run(
        "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?",
        title,
        Date.now(),
        id,
    );
}

export function deleteConversation(id: string): boolean {
    return run("DELETE FROM conversations WHERE id = ?", id).changes > 0;
}

export function touchConversation(id: string): void {
    run("UPDATE conversations SET updated_at = ? WHERE id = ?", Date.now(), id);
}

/** Next sequence number for a conversation (messages are ordered by seq). */
function nextSeq(conversationId: string): number {
    const r = queryOne<{ max_seq: number | null }>(
        "SELECT MAX(seq) AS max_seq FROM messages WHERE conversation_id = ?",
        conversationId,
    );
    return (r?.max_seq ?? 0) + 1;
}

export function addMessage(conversationId: string, msg: ChatMessage): void {
    const seq = nextSeq(conversationId);
    run(
        `INSERT INTO messages (id, conversation_id, seq, role, text, reasoning, tool_calls, model, usage, duration_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        msg.id,
        conversationId,
        seq,
        msg.role,
        msg.text,
        msg.reasoning ?? null,
        msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
        msg.model ?? null,
        msg.usage ? JSON.stringify(msg.usage) : null,
        msg.durationMs ?? null,
        msg.createdAt,
    );
    touchConversation(conversationId);
}
