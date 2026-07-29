// Frontend REST client. Routes are defined once in shared/routes.ts (method,
// path, body/response schemas) and looked up by key here - there are no
// hardcoded paths in this file. Adding/removing/changing a route in the
// registry propagates to both sides at compile time; the response type is
// inferred from the route's response schema via z.infer.

import type { z } from "zod";
import { type RouteKey, routes } from "$shared/routes.ts";

const BASE = "/api";

/** The JSON response type a route returns. */
type ResponseOf<K extends RouteKey> = z.infer<(typeof routes)[K]["response"]>;
/** The request body type a route accepts (or undefined if it has none). */
type BodyOf<K extends RouteKey> = (typeof routes)[K] extends { body: z.ZodType }
    ? z.infer<(typeof routes)[K]["body"]>
    : undefined;

/** Build a URL from a route path template + params + optional query. */
function buildUrl(
    key: RouteKey,
    params: Record<string, string> = {},
    query: Record<string, unknown> = {},
): string {
    let path: string = routes[key].path;
    for (const [k, v] of Object.entries(params)) {
        path = path.replace(`:${k}`, encodeURIComponent(v));
    }
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) sp.set(k, String(v));
    }
    const qs = sp.toString();
    if (qs) path += `?${qs}`;
    return `${BASE}${path}`;
}

/** Issue a request for a route. Response type is inferred from the registry. */
async function request<K extends RouteKey>(
    key: K,
    opts: {
        params?: Record<string, string>;
        body?: BodyOf<K>;
        query?: Record<string, unknown>;
    } = {},
): Promise<ResponseOf<K>> {
    const route = routes[key];
    const path = buildUrl(key, opts.params, opts.query ?? {});
    const hasBody = opts.body !== undefined;
    const r = await fetch(path, {
        method: route.method,
        headers: hasBody ? { "content-type": "application/json" } : undefined,
        body: hasBody ? JSON.stringify(opts.body) : undefined,
    });
    if (!r.ok) {
        const detail = await r.text().catch(() => "");
        throw new Error(
            `${route.method} ${routes[key].path}: ${r.status} ${detail}`,
        );
    }
    return r.json() as Promise<ResponseOf<K>>;
}

// --- Providers ---
export const listProviders = () => request("providers.list");
export const createProvider = (input: BodyOf<"providers.create">) =>
    request("providers.create", { body: input });
export const updateProvider = (id: string, input: BodyOf<"providers.update">) =>
    request("providers.update", { params: { id }, body: input });
export const deleteProvider = (id: string) =>
    request("providers.delete", { params: { id } });
export const testProvider = (id: string) =>
    request("providers.test", { params: { id } });
export const fetchProviderModels = (id: string) =>
    request("providers.fetchModels", { params: { id } });

// --- Settings ---
export const getSettings = () => request("settings.get");
export const updateSettings = (patch: BodyOf<"settings.update">) =>
    request("settings.update", { body: patch });

// --- Assistants ---
export const listAssistants = () => request("assistants.list");
export const getAssistant = (id: string) =>
    request("assistants.get", { params: { id } });
export const createAssistant = (input: BodyOf<"assistants.create">) =>
    request("assistants.create", { body: input });
export const updateAssistant = (
    id: string,
    input: BodyOf<"assistants.update">,
) => request("assistants.update", { params: { id }, body: input });
export const deleteAssistant = (id: string) =>
    request("assistants.delete", { params: { id } });

// --- Conversations ---
export const listConversations = (assistantId?: string) =>
    request("conversations.list", { query: { assistantId } });
export const getConversation = (id: string) =>
    request("conversations.get", { params: { id } });
export const getMessagesBefore = (id: string, beforeSeq: number, limit = 30) =>
    request("conversations.messages", {
        params: { id },
        query: { before: beforeSeq, limit },
    });
export const createConversation = (input: BodyOf<"conversations.create">) =>
    request("conversations.create", { body: input });
export const deleteConversation = (id: string) =>
    request("conversations.delete", { params: { id } });

// --- Chat (SSE; the response is a stream, not JSON, so it's handled directly
// in chat.svelte.ts. Exposed here only so the path isn't hardcoded there.) ---
export const chatPath = () => `${BASE}${routes["chat.send"].path}`;
