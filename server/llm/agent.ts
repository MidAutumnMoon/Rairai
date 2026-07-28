// The chat runner: turns a ChatRequest into a stream of ServerEvents by driving
// a pi-agent-core Agent. Also captures every outbound LLM call into a NetworkLog
// (the request inspector's data) without wrapping the stream - the request is
// read from the `context` passed to the streamFn, and the response is read from
// the Agent's `message_end` event.

import { Agent, type AgentMessage, type StreamFn } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, Message, TextContent, ThinkingContent, Usage } from "@earendil-works/pi-ai";
import { resolveProvider } from "./providers.ts";
import { sampleTools } from "./tools.ts";
import type {
    ChatMessage,
    ChatRequest,
    NetworkLog,
    ServerEvent,
    ToolCall,
    TokenUsage,
} from "../../shared/chat-events.ts";

const text = (s: string): TextContent => ({ type: "text", text: s });

const zeroUsage: Usage = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function safeParse<T>(s: string | undefined, fallback: T): T {
    if (!s) return fallback;
    try {
        return JSON.parse(s) as T;
    } catch {
        return fallback;
    }
}

function toPiUsage(u: TokenUsage): Usage {
    return {
        ...zeroUsage,
        input: u.input,
        output: u.output,
        totalTokens: u.input + u.output,
    };
}

/** Reconstruct pi's Message[] from frontend ChatMessage[], expanding each
 *  assistant tool call into a toolCall part plus a toolResult message. */
function toPiMessages(history: ChatMessage[], api: string, provider: string, model: string): AgentMessage[] {
    const out: Message[] = [];
    for (const m of history) {
        if (m.role === "user") {
            out.push({ role: "user", content: [text(m.text)], timestamp: m.createdAt });
            continue;
        }
        const parts: (TextContent | ThinkingContent | { type: "toolCall"; id: string; name: string; arguments: Record<string, unknown> })[] = [];
        if (m.reasoning) parts.push({ type: "thinking", thinking: m.reasoning });
        if (m.text) parts.push(text(m.text));
        for (const tc of m.toolCalls ?? []) {
            parts.push({ type: "toolCall", id: tc.id, name: tc.name, arguments: safeParse(tc.args, {}) });
        }
        out.push({
            role: "assistant",
            content: parts,
            api,
            provider,
            model,
            usage: m.usage ? toPiUsage(m.usage) : zeroUsage,
            stopReason: (m.toolCalls?.length ?? 0) > 0 ? "toolUse" : "stop",
            timestamp: m.createdAt,
        });
        for (const tc of m.toolCalls ?? []) {
            out.push({
                role: "toolResult",
                toolCallId: tc.id,
                toolName: tc.name,
                content: [text(tc.result ?? "")],
                isError: tc.status === "error",
                timestamp: m.createdAt,
            });
        }
    }
    return out as unknown as AgentMessage[];
}

function resultToText(result: unknown): string {
    if (!result || typeof result !== "object") return JSON.stringify(result);
    const r = result as { content?: { type: string; text?: string }[] };
    if (Array.isArray(r.content)) {
        return r.content.map((c) => (c.type === "text" ? c.text : "")).join("\n");
    }
    return JSON.stringify(result);
}

export async function runChat(
    req: ChatRequest,
    emit: (e: ServerEvent) => void,
    _signal: AbortSignal,
): Promise<void> {
    const { models, model } = resolveProvider();
    const api = model.api as string;
    const provider = model.provider as string;
    const modelId = model.id;

    const last = req.messages[req.messages.length - 1];
    if (!last || last.role !== "user") {
        emit({ type: "error", message: "The last message must be a user message." });
        return;
    }
    const history = toPiMessages(req.messages.slice(0, -1), api, provider, modelId);

    // Network-log capture state (one entry per LLM call / assistant turn).
    let curId = "";
    let curStart = 0;
    let curRequest: NetworkLog["request"] | null = null;
    let curChunks: { timestamp: number; data: string }[] = [];

    const realStreamFn = models.streamSimple.bind(models);
    const loggingStreamFn: StreamFn = (m, ctx, options) => {
        curId = `nl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        curStart = Date.now();
        curRequest = {
            url: m.baseUrl,
            method: "POST",
            headers: { "content-type": "application/json" },
            body: {
                model: m.id,
                provider: m.provider,
                systemPrompt: ctx.systemPrompt ?? null,
                tools: (ctx.tools ?? []).map((t) => ({ name: t.name, description: t.description })),
                messages: ctx.messages,
            },
        };
        curChunks = [];
        return realStreamFn(m, ctx, options);
    };

    // Accumulator for the final assistant message.
    let accText = "";
    let accReasoning = "";
    const toolCalls = new Map<string, ToolCall>();
    const toolStarts = new Map<string, number>();
    let usage: TokenUsage | undefined;
    let assistantModel: string | undefined;
    const startedAt = Date.now();

    const agent = new Agent({
        initialState: {
            systemPrompt: req.systemPrompt ?? "",
            model,
            messages: history,
            tools: sampleTools,
        },
        streamFn: loggingStreamFn,
    });

    const unsub = agent.subscribe((event) => {
        switch (event.type) {
            case "message_update": {
                const e = event.assistantMessageEvent;
                if ("delta" in e && typeof e.delta === "string") {
                    curChunks.push({ timestamp: Date.now(), data: e.delta });
                }
                if (e.type === "text_delta") {
                    accText += e.delta;
                    emit({ type: "text", delta: e.delta });
                } else if (e.type === "thinking_delta") {
                    accReasoning += e.delta;
                    emit({ type: "reasoning", delta: e.delta });
                } else if (e.type === "toolcall_end") {
                    const tc = e.toolCall;
                    const entry: ToolCall = {
                        id: tc.id,
                        name: tc.name,
                        args: JSON.stringify(tc.arguments ?? {}),
                        status: "pending",
                    };
                    toolCalls.set(tc.id, entry);
                    toolStarts.set(tc.id, Date.now());
                    emit({ type: "tool_call", toolCall: entry });
                }
                break;
            }
            case "tool_execution_start": {
                const existing = toolCalls.get(event.toolCallId) ?? {
                    id: event.toolCallId,
                    name: event.toolName,
                    args: JSON.stringify(event.args ?? {}),
                    status: "running" as const,
                };
                existing.status = "running";
                existing.args = JSON.stringify(event.args ?? {});
                toolCalls.set(event.toolCallId, existing);
                toolStarts.set(event.toolCallId, Date.now());
                emit({ type: "tool_call", toolCall: existing });
                break;
            }
            case "tool_execution_end": {
                const existing = toolCalls.get(event.toolCallId) ?? {
                    id: event.toolCallId,
                    name: event.toolName,
                    args: "",
                    status: "success" as const,
                };
                existing.status = event.isError ? "error" : "success";
                existing.result = resultToText(event.result);
                const start = toolStarts.get(event.toolCallId);
                if (start) existing.durationMs = Date.now() - start;
                toolCalls.set(event.toolCallId, existing);
                emit({ type: "tool_call", toolCall: existing });
                break;
            }
            case "message_end": {
                if (event.message.role !== "assistant") break;
                const am = event.message as AssistantMessage;
                assistantModel = am.model;
                usage = { input: am.usage.input, output: am.usage.output };
                const isError = am.stopReason === "error" || am.stopReason === "aborted";
                const log: NetworkLog = {
                    id: curId,
                    timestamp: curStart,
                    request: curRequest!,
                    response: {
                        status: isError ? 500 : 200,
                        statusText: isError ? (am.errorMessage ?? "error") : "OK",
                        headers: {},
                        body: am,
                        isStream: true,
                        streamChunks: curChunks,
                    },
                    error: isError ? { message: am.errorMessage ?? "error" } : null,
                    durationMs: Date.now() - curStart,
                    status: isError ? "error" : "success",
                };
                emit({ type: "network_log", log });
                break;
            }
        }
    });

    try {
        await agent.prompt(last.text);
    } finally {
        unsub();
    }

    emit({
        type: "done",
        message: {
            id: `msg_${Date.now()}`,
            role: "assistant",
            text: accText,
            reasoning: accReasoning || undefined,
            toolCalls: toolCalls.size ? [...toolCalls.values()] : undefined,
            model: assistantModel ?? modelId,
            usage,
            durationMs: Date.now() - startedAt,
            createdAt: startedAt,
        },
    });
}
