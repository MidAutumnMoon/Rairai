// Frontend REST client for the settings/conversation API. Thin typed wrappers
// over fetch; secrets are never present (the server returns `hasKey`-style
// provider records only). Used by both the chat store and the settings page.

import type {
    Assistant,
    AssistantInput,
    AssistantSummary,
    Conversation,
    ConversationSummary,
    MessagePage,
    Provider,
    ProviderInput,
    ProviderTestResult,
    Settings,
} from "../../shared/api.ts";

const BASE = "/api";

async function getJSON<T>(path: string): Promise<T> {
    const r = await fetch(`${BASE}${path}`);
    if (!r.ok) throw new Error(`GET ${path}: ${r.status} ${await r.text()}`);
    return r.json() as Promise<T>;
}

async function sendJSON<T>(method: string, path: string, body?: unknown): Promise<T> {
    const r = await fetch(`${BASE}${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`);
    return r.json() as Promise<T>;
}

// --- Providers ---
export const listProviders = () => getJSON<Provider[]>("/providers");
export const createProvider = (input: ProviderInput) => sendJSON<Provider>("POST", "/providers", input);
export const updateProvider = (id: string, input: ProviderInput) =>
    sendJSON<Provider>("PUT", `/providers/${encodeURIComponent(id)}`, input);
export const deleteProvider = (id: string) =>
    sendJSON<{ ok: boolean }>("DELETE", `/providers/${encodeURIComponent(id)}`);
export const testProvider = (id: string) =>
    sendJSON<ProviderTestResult>("POST", `/providers/${encodeURIComponent(id)}/test`);

// --- Settings ---
export const getSettings = () => getJSON<Settings>("/settings");
export const updateSettings = (patch: Partial<Settings>) => sendJSON<Settings>("PUT", "/settings", patch);

// --- Conversations ---
export const listConversations = (assistantId?: string) =>
    getJSON<ConversationSummary[]>(
        assistantId ? `/conversations?assistantId=${encodeURIComponent(assistantId)}` : "/conversations",
    );
export const getConversation = (id: string) =>
    getJSON<Conversation>(`/conversations/${encodeURIComponent(id)}`);
export const getMessagesBefore = (id: string, beforeSeq: number, limit = 30) =>
    getJSON<MessagePage>(`/conversations/${encodeURIComponent(id)}/messages?before=${beforeSeq}&limit=${limit}`);
export const createConversation = (input: { assistantId?: string; title?: string } = {}) =>
    sendJSON<Conversation>("POST", "/conversations", input);
export const deleteConversation = (id: string) =>
    sendJSON<{ ok: boolean }>("DELETE", `/conversations/${encodeURIComponent(id)}`);

// --- Assistants ---
export const listAssistants = () => getJSON<AssistantSummary[]>("/assistants");
export const getAssistant = (id: string) =>
    getJSON<Assistant>(`/assistants/${encodeURIComponent(id)}`);
export const createAssistant = (input: AssistantInput) => sendJSON<Assistant>("POST", "/assistants", input);
export const updateAssistant = (id: string, input: AssistantInput) =>
    sendJSON<Assistant>("PUT", `/assistants/${encodeURIComponent(id)}`, input);
export const deleteAssistant = (id: string) =>
    sendJSON<{ ok: boolean }>("DELETE", `/assistants/${encodeURIComponent(id)}`);
