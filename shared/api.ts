// REST resource types for the settings/conversation API.
// (The SSE stream protocol lives in chat-events.ts.) Imported by both sides.

import type { ChatMessage } from "./chat-events.ts";

/** Which pi-ai API impl a provider targets. `faux` is bootstrap-only. */
export type ApiType =
    | "openai-completions" // POST {baseUrl}/chat/completions  (OpenAI-compatible gateways)
    | "openai-responses" // POST {baseUrl}/responses          (OpenAI native)
    | "anthropic-messages" // POST {baseUrl}/v1/messages       (Anthropic)
    | "faux"; // dev, no key/no network

/** A provider as seen over the wire. The actual secret is NEVER included. */
export interface Provider {
    id: string;
    name: string;
    apiType: ApiType;
    /** Must include `/v1` for the openai-* types (the SDK appends the path). */
    baseUrl: string;
    /** Model ids this provider serves (sent verbatim as the request `model`). */
    models: string[];
    /** `env`: resolve from the named env var at call time. `inline`: key stored
     *  server-side (0600), pasted once via the UI. */
    credential: { source: "env" | "inline"; ref?: string };
    enabled: boolean;
    createdAt: number;
}

/** Body for create/update a provider. `key` is the actual secret, accepted only
 *  when credential.source === "inline"; it is never returned on read. */
export interface ProviderInput {
    name: string;
    apiType: ApiType;
    baseUrl: string;
    models: string[];
    credential: { source: "env" | "inline"; ref?: string };
    enabled: boolean;
    key?: string;
}
/** Role of a prompt block in an assistant's prompt list. `history` is a marker
 *  - not sent to the model - that says where the conversation history is
 *  spliced in. Blocks before it are the preamble; blocks after are appended. */
export type PromptRole = "system" | "user" | "assistant" | "history";

export interface PromptBlock {
    id: string;
    role: PromptRole;
    /** Short identifier shown in the editor (e.g. "Main", "Jailbreak"). */
    name: string;
    /** Prompt text (empty for the history marker). */
    content: string;
    enabled: boolean;
}

/** A persona/preset: a named, ordered list of prompt blocks. Each assistant
 *  owns its conversations (Cherry Studio-style). */
export interface Assistant {
    id: string;
    name: string;
    emoji: string;
    description: string;
    prompts: PromptBlock[];
    createdAt: number;
    updatedAt: number;
}

export interface AssistantSummary {
    id: string;
    name: string;
    emoji: string;
    description: string;
    createdAt: number;
    updatedAt: number;
}

export interface AssistantInput {
    name: string;
    emoji: string;
    description: string;
    prompts: PromptBlock[];
}

export interface Settings {
    defaultStream: boolean;
    activeProviderId: string | null;
    activeModel: string | null;
    activeAssistantId: string | null;
}

export interface ConversationSummary {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    assistantId: string | null;
    providerId: string | null;
    model: string | null;
    messageCount: number;
}

export interface Conversation extends ConversationSummary {
    /** The loaded range only (the recent tail on open, grown via loadOlder).
     *  Older messages are fetched on demand - never the whole conversation. */
    messages: ChatMessage[];
    /** Older messages exist on the server beyond the loaded range. */
    hasMore: boolean;
    /** seq of the oldest loaded message (cursor for loading older). */
    oldestSeq: number | null;
}

/** A page of older messages from GET /api/conversations/:id/messages?before=. */
export interface MessagePage {
    messages: ChatMessage[];
    hasMore: boolean;
    oldestSeq: number | null;
}

export interface ProviderTestResult {
    ok: boolean;
    error?: string;
}
