// Message mapping: convert stored ChatMessage[] <-> pi AgentMessage[], and
// build the preamble (system prompt + example messages) from an assistant's
// prompt blocks. Extracted from agent.ts so the orchestrator is just the
// event-loop wiring, not type-conversion boilerplate.

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type {
    Message,
    TextContent,
    ThinkingContent,
    Usage,
} from "@earendil-works/pi-ai";
import type { ChatMessage, TokenUsage } from "../../shared/chat-events.ts";
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
export function toPiMessages(
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

export function resultToText(result: unknown): string {
    if (typeof result === "string") return result;
    if (result && typeof result === "object" && "content" in result) {
        const content =
            (result as { content: { type: string; text?: string }[] }).content;
        return content
            .filter((c) => c.type === "text" && c.text)
            .map((c) => c.text!)
            .join("\n");
    }
    return JSON.stringify(result);
}

/** Build the model preamble from an assistant's prompt blocks: enabled system
 *  blocks become the Agent's systemPrompt (joined); enabled user/assistant
 *  blocks become example messages, split around the `history` marker so they
 *  prepend and/or append to the real conversation history. */
export function buildPreamble(
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
