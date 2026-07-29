// The chat runner: POST /api/chat identifies a conversation + new user text.
// The backend owns the history - it loads the conversation, persists the user
// message, runs the pi Agent, streams events, and persists the final assistant
// message. Network-log capture (the request inspector's data) is unchanged.

import {
    Agent,
    type AgentMessage,
    type StreamFn,
} from "@earendil-works/pi-agent-core";
import type {
    AssistantMessage,
    Message,
    TextContent,
    ThinkingContent,
    Usage,
} from "@earendil-works/pi-ai";
import { resolveProviderModel } from "./providers.ts";
import { sampleTools } from "./tools.ts";
import {
    addMessage,
    getAssistant,
    getConversation,
    getSettings,
    listProviders,
    NEW_CHAT_TITLE,
    updateConversationTitle,
} from "../db.ts";
import type {
    ChatMessage,
    ChatRequest,
    NetworkLog,
    ServerEvent,
    TokenUsage,
    ToolCall,
} from "../../shared/chat-events.ts";
import { uid } from "../../shared/id.ts";
import type { PromptBlock } from "../../shared/api.ts";

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

/** Reconstruct pi Message[] from stored ChatMessage[], expanding each assistant
 *  tool call into a toolCall part plus a toolResult message. */
function toPiMessages(
    history: ChatMessage[],
    api: string,
    provider: string,
    model: string,
): AgentMessage[] {
    const out: Message[] = [];
    for (const m of history) {
        if (m.role === "user") {
            out.push({
                role: "user",
                content: [text(m.text)],
                timestamp: m.createdAt,
            });
            continue;
        }
        const parts: (TextContent | ThinkingContent | {
            type: "toolCall";
            id: string;
            name: string;
            arguments: Record<string, unknown>;
        })[] = [];
        if (m.reasoning) {
            parts.push({ type: "thinking", thinking: m.reasoning });
        }
        if (m.text) parts.push(text(m.text));
        for (const tc of m.toolCalls ?? []) {
            parts.push({
                type: "toolCall",
                id: tc.id,
                name: tc.name,
                arguments: safeParse(tc.args, {}),
            });
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
        return r.content.map((c) => (c.type === "text" ? c.text : "")).join(
            "\n",
        );
    }
    return JSON.stringify(result);
}

/** Captures one outbound LLM HTTP call (one assistant turn) for the network
 *  inspector. The lifecycle is `begin()` (streamFn starts) → `trackChunk()`
 *  (each delta) → `finalize()` (assistant message completes); that ordering is
 *  the invariant the agent loop relies on. Encapsulating it here keeps the
 *  begin→finalize contract in one place instead of spread across loose locals
 *  where a missed `begin` would silently emit a log with a null request. */
class NetworkCapture {
    private id = "";
    private start = 0;
    private request: NetworkLog["request"] | null = null;
    private chunks: { timestamp: number; data: string }[] = [];

    begin(request: NetworkLog["request"]): void {
        this.id = `nl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        this.start = Date.now();
        this.request = request;
        this.chunks = [];
    }

    trackChunk(delta: string): void {
        this.chunks.push({ timestamp: Date.now(), data: delta });
    }

    finalize(am: AssistantMessage): NetworkLog {
        const isError = am.stopReason === "error" ||
            am.stopReason === "aborted";
        return {
            id: this.id,
            timestamp: this.start,
            request: this.request!,
            response: {
                status: isError ? 500 : 200,
                statusText: isError ? (am.errorMessage ?? "error") : "OK",
                headers: {},
                body: am,
                isStream: true,
                streamChunks: this.chunks,
            },
            error: isError ? { message: am.errorMessage ?? "error" } : null,
            durationMs: Date.now() - this.start,
            status: isError ? "error" : "success",
        };
    }
}

/** Build the model preamble from an assistant's prompt blocks: enabled system
 *  blocks become the Agent's systemPrompt (joined); enabled user/assistant
 *  blocks become example messages, split around the `history` marker so they
 *  prepend and/or append to the real conversation history. */
function buildPreamble(
    prompts: PromptBlock[],
    api: string,
    provider: string,
    model: string,
): {
    systemPrompt: string;
    preMessages: AgentMessage[];
    postMessages: AgentMessage[];
} {
    const histIdx = prompts.findIndex((p) => p.role === "history");
    const pre = histIdx < 0 ? prompts : prompts.slice(0, histIdx);
    const post = histIdx < 0 ? [] : prompts.slice(histIdx + 1);
    const systemPrompt = prompts
        .filter((p) => p.enabled && p.role === "system" && p.content)
        .map((p) => p.content)
        .join("\n\n");
    const blockToMessage = (p: PromptBlock): Message =>
        p.role === "user"
            ? {
                role: "user",
                content: [text(p.content)],
                timestamp: Date.now(),
            }
            : {
                role: "assistant",
                content: [text(p.content)],
                api,
                provider,
                model,
                usage: zeroUsage,
                stopReason: "stop",
                timestamp: Date.now(),
            };
    const example = (ps: PromptBlock[]) =>
        ps.filter((p) =>
            p.enabled && (p.role === "user" || p.role === "assistant")
        )
            .map(blockToMessage) as unknown as AgentMessage[];
    return {
        systemPrompt,
        preMessages: example(pre),
        postMessages: example(post),
    };
}

export async function runChat(
    req: ChatRequest,
    emit: (e: ServerEvent) => void,
    signal: AbortSignal,
): Promise<void> {
    const conv = getConversation(req.conversationId);
    if (!conv) {
        emit({
            type: "error",
            message: `Conversation not found: ${req.conversationId}`,
        });
        return;
    }
    const settings = getSettings();

    // Resolve the assistant owning this conversation (or the active one) and
    // build its prompt preamble: system blocks -> systemPrompt, user/assistant
    // blocks -> example messages spliced around the history insertion marker.
    const assistant = (conv.assistantId ?? settings.activeAssistantId)
        ? getAssistant(conv.assistantId ?? settings.activeAssistantId!)
        : null;

    // Provider + model resolution (Cherry Studio-style): a per-conversation
    // override wins, else the assistant's binding, else the first enabled
    // provider + its first model. An assistant with no model bound is an
    // error - no silent fallback to an arbitrary model.
    let providerId = conv.providerId ?? assistant?.providerId ?? null;
    let modelId = conv.model ?? assistant?.modelId ?? null;
    if (!providerId) {
        const enabled = listProviders().filter((p) => p.enabled);
        providerId = enabled[0]?.id ?? null;
        modelId = enabled[0]?.models[0]?.id ?? null;
    }
    if (!providerId || !modelId) {
        emit({
            type: "error",
            message: assistant?.providerId
                ? `The assistant's provider is no longer available. Pick a model in Settings.`
                : "No provider/model configured. Bind one to the assistant in Settings.",
        });
        return;
    }
    const { models, model } = resolveProviderModel(providerId, modelId);
    const api = model.api as string;
    const provider = model.provider as string;
    const modelIdResolved = model.id;

    // Persist the new user message, then auto-title if this is the first turn.
    const userMsg: ChatMessage = {
        id: uid("msg"),
        role: "user",
        text: req.text,
        createdAt: Date.now(),
    };
    addMessage(conv.id, userMsg);
    if (conv.title === NEW_CHAT_TITLE) {
        updateConversationTitle(conv.id, req.text.slice(0, 48));
    }

    const { systemPrompt, preMessages, postMessages } = buildPreamble(
        assistant?.prompts ?? [],
        api,
        provider,
        modelIdResolved,
    );
    // History excludes the just-persisted user message (conv was loaded before).
    const history = toPiMessages(conv.messages, api, provider, modelIdResolved);
    const messages = [...preMessages, ...history, ...postMessages];

    const capture = new NetworkCapture();
    const realStreamFn = models.streamSimple.bind(models);
    const loggingStreamFn: StreamFn = (m, ctx, options) => {
        capture.begin({
            url: m.baseUrl,
            method: "POST",
            headers: { "content-type": "application/json" },
            body: {
                model: m.id,
                provider: m.provider,
                systemPrompt: ctx.systemPrompt ?? null,
                tools: (ctx.tools ?? []).map((t) => ({
                    name: t.name,
                    description: t.description,
                })),
                messages: ctx.messages,
            },
        });
        return realStreamFn(m, ctx, options);
    };

    let accText = "";
    let accReasoning = "";
    const tools = new Map<string, { entry: ToolCall; startedAt: number }>();
    let usage: TokenUsage | undefined;
    let assistantModel: string | undefined;
    const startedAt = Date.now();

    const agent = new Agent({
        initialState: {
            systemPrompt,
            model,
            messages: messages,
            tools: sampleTools,
        },
        streamFn: loggingStreamFn,
    });

    // Honor client disconnect / abort: stop the pi Agent so the LLM call
    // doesn't keep running and streaming into a dead connection.
    const onAbort = () => agent.abort();
    if (signal.aborted) agent.abort();
    else signal.addEventListener("abort", onAbort);

    const unsub = agent.subscribe((event) => {
        switch (event.type) {
            case "message_update": {
                const e = event.assistantMessageEvent;
                if ("delta" in e && typeof e.delta === "string") {
                    capture.trackChunk(e.delta);
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
                    tools.set(tc.id, { entry, startedAt: Date.now() });
                    emit({ type: "tool_call", toolCall: entry });
                }
                break;
            }
            case "tool_execution_start": {
                const cur = tools.get(event.toolCallId) ?? {
                    entry: {
                        id: event.toolCallId,
                        name: event.toolName,
                        args: JSON.stringify(event.args ?? {}),
                        status: "running" as const,
                    },
                    startedAt: Date.now(),
                };
                cur.entry.status = "running";
                cur.entry.args = JSON.stringify(event.args ?? {});
                cur.startedAt = Date.now();
                tools.set(event.toolCallId, cur);
                emit({ type: "tool_call", toolCall: cur.entry });
                break;
            }
            case "tool_execution_end": {
                const cur = tools.get(event.toolCallId) ?? {
                    entry: {
                        id: event.toolCallId,
                        name: event.toolName,
                        args: "",
                        status: "success" as const,
                    },
                    startedAt: Date.now(),
                };
                cur.entry.status = event.isError ? "error" : "success";
                cur.entry.result = resultToText(event.result);
                cur.entry.durationMs = Date.now() - cur.startedAt;
                tools.set(event.toolCallId, cur);
                emit({ type: "tool_call", toolCall: cur.entry });
                break;
            }
            case "message_end": {
                if (event.message.role !== "assistant") break;
                const am = event.message as AssistantMessage;
                assistantModel = am.model;
                usage = { input: am.usage.input, output: am.usage.output };
                emit({ type: "network_log", log: capture.finalize(am) });
                break;
            }
        }
    });

    try {
        await agent.prompt(req.text);
    } finally {
        signal.removeEventListener("abort", onAbort);
        unsub();
    }

    const finalMessage: ChatMessage = {
        id: uid("msg"),
        role: "assistant",
        text: accText,
        reasoning: accReasoning || undefined,
        toolCalls: tools.size
            ? [...tools.values()].map((t) => t.entry)
            : undefined,
        model: assistantModel ?? modelIdResolved,
        usage,
        durationMs: Date.now() - startedAt,
        createdAt: startedAt,
    };
    addMessage(conv.id, finalMessage);
    emit({ type: "done", message: finalMessage });
}
