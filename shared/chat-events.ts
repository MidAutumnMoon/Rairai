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

// ---------------------------------------------------------------------------
// Request: frontend -> backend
// ---------------------------------------------------------------------------

/** A chat message as stored/owned by the frontend. */
export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    /** Main text content (markdown). */
    text: string;
    /** Accumulated reasoning/thinking text, if the model produced any. */
    reasoning?: string;
    /** Tool calls made during this assistant turn. Results are embedded. */
    toolCalls?: ToolCall[];
    /** Model id that produced this (assistant messages). */
    model?: string;
    usage?: TokenUsage;
    durationMs?: number;
    createdAt: number;
}

export interface ToolCall {
    /** pi tool_call_id (provider-assigned) or a synthetic id. */
    id: string;
    name: string;
    /** Raw JSON string of the call arguments. */
    args: string;
    /** Raw JSON string of the result (success) or error message. */
    result?: string;
    status: "pending" | "running" | "success" | "error";
    durationMs?: number;
}

export interface TokenUsage {
    input: number;
    output: number;
}

/** Body of POST /api/chat. The backend owns conversation history - the client
 *  just identifies the conversation and sends the new user text. */
export interface ChatRequest {
    conversationId: string;
    text: string;
}

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
export type ServerEvent =
    | { type: "text"; delta: string }
    | { type: "reasoning"; delta: string }
    | { type: "tool_call"; toolCall: ToolCall }
    | { type: "network_log"; log: NetworkLog }
    | { type: "done"; message: ChatMessage }
    | { type: "error"; message: string };

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
 */
export interface NetworkLog {
    id: string;
    timestamp: number;
    request: {
        url: string;
        method: string;
        headers: Record<string, string>;
        /** Parsed JSON body if the request was JSON, else the raw string. */
        body: unknown;
    };
    response: {
        status: number;
        statusText: string;
        headers: Record<string, string>;
        /** Parsed JSON body, or raw string. */
        body: unknown;
        isStream: boolean;
        /** For SSE streams: each chunk with its timestamp. */
        streamChunks?: { timestamp: number; data: string }[];
    } | null;
    error: { message: string } | null;
    durationMs: number | null;
    status: "pending" | "streaming" | "success" | "error";
}

/** SSE helper: format an event as an SSE `data:` line. */
export function sseLine(event: ServerEvent): string {
    return `data: ${JSON.stringify(event)}\n\n`;
}
