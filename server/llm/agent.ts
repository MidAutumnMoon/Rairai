// The chat runner: POST /api/chat identifies a conversation + new user text.
// The backend owns the history - it loads the conversation, persists the user
// message, runs the pi Agent, streams events, and persists the final assistant
// message. Message mapping + network capture live in their own modules.

import { Agent, type StreamFn } from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { resolveProviderModel } from "./providers.ts";
import { sampleTools } from "./tools.ts";
import { buildPreamble, resultToText, toPiMessages } from "./messages.ts";
import { NetworkCapture } from "./capture.ts";
import {
    addMessage,
    getAssistant,
    getConversation,
    getSettings,
    listProviders,
    NEW_CHAT_TITLE,
    updateConversationTitle,
} from "../db/mod.ts";
import type {
    ChatMessage,
    ChatRequest,
    ServerEvent,
    TokenUsage,
    ToolCall,
} from "../../shared/chat-events.ts";
import { uid } from "../../shared/id.ts";

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
