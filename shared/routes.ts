// Single source of truth for REST API routes. Both the backend (server/main.ts)
// and the frontend (lib/api.ts) import from here, so a route can't drift between
// sides: add/remove/change a route here and both sides follow at compile time.
//
// Each entry binds: HTTP method, path template (Hono-style ":param"), optional
// request body schema, response schema, and optional query-param schemas. The
// frontend's request() infers the response type from `response` via z.infer, so
// changing a response schema automatically changes the client's return type.
//
// Paths are WITHOUT the "/api" prefix - both sides prepend it. This keeps the
// registry about route identity, not deployment wiring.

import { z } from "zod";
import {
    AssistantInputSchema,
    AssistantSchema,
    AssistantSummarySchema,
    ConversationCreateSchema,
    ConversationSchema,
    ConversationSummarySchema,
    MessagePageSchema,
    ModelsFetchResultSchema,
    ProviderInputSchema,
    ProviderSchema,
    ProviderTestResultSchema,
    SettingsPatchSchema,
    SettingsSchema,
} from "./api.ts";
import { ChatRequestSchema } from "./chat-events.ts";

export type RouteDef = {
    method: "GET" | "POST" | "PUT" | "DELETE";
    path: string;
    body?: z.ZodType;
    response: z.ZodType;
    query?: Record<string, z.ZodType>;
};

export const routes = {
    // --- Providers ---
    "providers.list": {
        method: "GET",
        path: "/providers",
        response: z.array(ProviderSchema),
    },
    "providers.create": {
        method: "POST",
        path: "/providers",
        body: ProviderInputSchema,
        response: ProviderSchema,
    },
    "providers.update": {
        method: "PUT",
        path: "/providers/:id",
        body: ProviderInputSchema,
        response: ProviderSchema,
    },
    "providers.delete": {
        method: "DELETE",
        path: "/providers/:id",
        response: z.object({ ok: z.boolean() }),
    },
    "providers.test": {
        method: "POST",
        path: "/providers/:id/test",
        response: ProviderTestResultSchema,
    },
    "providers.fetchModels": {
        method: "POST",
        path: "/providers/:id/models",
        response: ModelsFetchResultSchema,
    },

    // --- Settings ---
    "settings.get": {
        method: "GET",
        path: "/settings",
        response: SettingsSchema,
    },
    "settings.update": {
        method: "PUT",
        path: "/settings",
        body: SettingsPatchSchema,
        response: SettingsSchema,
    },

    // --- Assistants ---
    "assistants.list": {
        method: "GET",
        path: "/assistants",
        response: z.array(AssistantSummarySchema),
    },
    "assistants.get": {
        method: "GET",
        path: "/assistants/:id",
        response: AssistantSchema,
    },
    "assistants.create": {
        method: "POST",
        path: "/assistants",
        body: AssistantInputSchema,
        response: AssistantSchema,
    },
    "assistants.update": {
        method: "PUT",
        path: "/assistants/:id",
        body: AssistantInputSchema,
        response: AssistantSchema,
    },
    "assistants.delete": {
        method: "DELETE",
        path: "/assistants/:id",
        response: z.object({ ok: z.boolean() }),
    },

    // --- Conversations ---
    "conversations.list": {
        method: "GET",
        path: "/conversations",
        response: z.array(ConversationSummarySchema),
        query: { assistantId: z.string().optional() },
    },
    "conversations.create": {
        method: "POST",
        path: "/conversations",
        body: ConversationCreateSchema,
        response: ConversationSchema,
    },
    "conversations.get": {
        method: "GET",
        path: "/conversations/:id",
        response: ConversationSchema,
    },
    "conversations.messages": {
        method: "GET",
        path: "/conversations/:id/messages",
        response: MessagePageSchema,
        query: {
            before: z.coerce.number().int(),
            limit: z.coerce.number().int().optional(),
        },
    },
    "conversations.delete": {
        method: "DELETE",
        path: "/conversations/:id",
        response: z.object({ ok: z.boolean() }),
    },

    // --- Chat (SSE; the response is a stream, not JSON) ---
    "chat.send": {
        method: "POST",
        path: "/chat",
        body: ChatRequestSchema,
        response: z.never(), // SSE stream, handled specially
    },
} as const satisfies Record<string, RouteDef>;

export type RouteKey = keyof typeof routes;
