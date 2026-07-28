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

export interface Settings {
    defaultSystemPrompt: string;
    defaultStream: boolean;
    activeProviderId: string | null;
    activeModel: string | null;
}

export interface ConversationSummary {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    providerId: string | null;
    model: string | null;
    messageCount: number;
}

export interface Conversation extends ConversationSummary {
    /** null = use Settings.defaultSystemPrompt. */
    systemPrompt: string | null;
    messages: ChatMessage[];
}

export interface ProviderTestResult {
    ok: boolean;
    error?: string;
}
