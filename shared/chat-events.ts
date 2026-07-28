// Wire protocol between the Svelte frontend and the Deno/Hono backend for chat.
//
// The backend runs the LLM agent loop (pi-agent-core) server-side and streams
// events back over SSE on POST /api/chat. This file is the single source of
// truth for that protocol - imported by both sides so they can't drift.
//
// Design note: we deliberately do NOT leak pi-agent-core's internal event
// types (AgentEvent / AssistantMessageEvent) over the wire. The frontend is a
// consumer of a small, stable protocol; the backend translates from pi's
// richer event surface into this minimal one.
//
// Every shape here is a zod schema; the exported TS types are z.infer of those
// schemas, so the runtime validator and the compile-time type can never drift.
// The backend .parse()s requests; the frontend safeParse()s each SSE event.

import { z } from "zod";

// ---------------------------------------------------------------------------
// Request: frontend -> backend
// ---------------------------------------------------------------------------

/** A chat message as stored/owned by the frontend. */
export const MessageRoleSchema = z.enum(["user", "assistant"]);

export const TokenUsageSchema = z.object({
    input: z.number(),
    output: z.number(),
});
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

export const ToolCallSchema = z.object({
    /** pi tool_call_id (provider-assigned) or a synthetic id. */
    id: z.string(),
    name: z.string(),
    /** Raw JSON string of the call arguments. */
    args: z.string(),
    /** Raw JSON string of the result (success) or error message. */
    result: z.string().optional(),
    status: z.enum(["pending", "running", "success", "error"]),
    durationMs: z.number().optional(),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

export const ChatMessageSchema = z.object({
    id: z.string(),
    role: MessageRoleSchema,
    /** Main text content (markdown). */
    text: z.string(),
    /** Accumulated reasoning/thinking text, if the model produced any. */
    reasoning: z.string().optional(),
    /** Tool calls made during this assistant turn. Results are embedded. */
    toolCalls: z.array(ToolCallSchema).optional(),
    /** Model id that produced this (assistant messages). */
    model: z.string().optional(),
    usage: TokenUsageSchema.optional(),
    durationMs: z.number().optional(),
    createdAt: z.number(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

/** Body of POST /api/chat. The backend owns conversation history - the client
 *  just identifies the conversation and sends the new user text. */
export const ChatRequestSchema = z.object({
    conversationId: z.string(),
    text: z.string(),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

// ---------------------------------------------------------------------------
// Response: backend -> frontend (SSE stream of ServerEvent)
// ---------------------------------------------------------------------------

/**
 * One event in the SSE stream. Each SSE `data:` line is `JSON.stringify(event)`.
 *
 * Text/reasoning deltas accumulate on the client by appending. Tool-call events
 * carry the full current state of one tool call; the client replaces by id.
 * `done` carries the finalized assistant message to commit to the conversation.
 */
export const ServerEventSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("text"), delta: z.string() }),
    z.object({ type: z.literal("reasoning"), delta: z.string() }),
    z.object({ type: z.literal("tool_call"), toolCall: ToolCallSchema }),
    z.object({ type: z.literal("network_log"), log: z.lazy(() => NetworkLogSchema) }),
    z.object({ type: z.literal("done"), message: ChatMessageSchema }),
    z.object({ type: z.literal("error"), message: z.string() }),
]);
export type ServerEvent = z.infer<typeof ServerEventSchema>;

// ---------------------------------------------------------------------------
// Network log entry (the request inspector's data)
// ---------------------------------------------------------------------------

/**
 * One outbound LLM HTTP call, captured server-side by wrapping the stream
 * function. Mirrors IdoFront's NetworkLog shape, but populated from the
 * backend (where the real provider calls happen) rather than client-side.
 *
 * For streaming responses, chunks are captured individually AND the joined body
 * is stored - the inspector can show either the aggregated body or per-chunk.
 *
 * The request/response `body` fields are `unknown`: they hold arbitrary
 * provider payloads (raw OpenAI/Anthropic JSON, or an AssistantMessage). The
 * envelope is validated; the payload is intentionally left loose so a provider
 * schema change never breaks the inspector.
 */
export const NetworkLogSchema = z.object({
    id: z.string(),
    timestamp: z.number(),
    request: z.object({
        url: z.string(),
        method: z.string(),
        headers: z.record(z.string()),
        /** Parsed JSON body if the request was JSON, else the raw string. */
        body: z.unknown(),
    }),
    response: z.object({
        status: z.number(),
        statusText: z.string(),
        headers: z.record(z.string()),
        /** Parsed JSON body, or raw string. */
        body: z.unknown(),
        isStream: z.boolean(),
        /** For SSE streams: each chunk with its timestamp. */
        streamChunks: z.array(z.object({ timestamp: z.number(), data: z.string() })).optional(),
    }).nullable(),
    error: z.object({ message: z.string() }).nullable(),
    durationMs: z.number().nullable(),
    status: z.enum(["pending", "streaming", "success", "error"]),
});
export type NetworkLog = z.infer<typeof NetworkLogSchema>;

/** SSE helper: format an event as an SSE `data:` line. */
export function sseLine(event: ServerEvent): string {
    return `data: ${JSON.stringify(event)}\n\n`;
}
