// REST resource types for the settings/conversation API.
// (The SSE stream protocol lives in chat-events.ts.) Imported by both sides.
//
// Every shape is a zod schema; exported TS types are z.infer of those schemas,
// so the runtime validator and the compile-time type can never drift apart.
// The backend .parse()s request bodies and DB rows against these.

import { z } from "zod";
import { ChatMessageSchema } from "./chat-events.ts";

/** Which pi-ai API impl a provider targets. `faux` is bootstrap-only. */
export const ApiTypeSchema = z.enum([
    "openai-completions", // POST {baseUrl}/chat/completions  (OpenAI-compatible gateways)
    "openai-responses", // POST {baseUrl}/responses          (OpenAI native)
    "anthropic-messages", // POST {baseUrl}/v1/messages       (Anthropic)
    "faux", // dev, no key/no network
]);
export type ApiType = z.infer<typeof ApiTypeSchema>;

/** `env`: resolve from the named env var at call time. `inline`: key stored
 *  server-side (0600), pasted once via the UI. */
export const CredentialSchema = z.object({
    source: z.enum(["env", "inline"]),
    ref: z.string().optional(),
});

/** A model served by a provider. `id` is sent verbatim as the request `model`;
 *  `group` is the maker (derived from the id: segment before `/`, else the
 *  first `-`-segment) for categorization in the UI. */
export const ModelSchema = z.object({
    id: z.string(),
    name: z.string(),
    group: z.string(),
});
export type Model = z.infer<typeof ModelSchema>;

/** Derive a model's maker/group from its id: the segment before `/`, else the
 *  first `-`-segment (Cherry Studio's derivation). Used when fetching models
 *  from an API and when migrating legacy `string[]` model lists. */
export function groupOf(modelId: string): string {
    const slash = modelId.split("/");
    if (slash.length > 1) return slash[0];
    const dash = modelId.split("-");
    return dash[0] || "other";
}

/** Build a Model from a bare id (name == id, group derived). */
export function toModel(id: string): Model {
    return ModelSchema.parse({ id, name: id, group: groupOf(id) });
}

/** The OpenAI-compatible `/models` response shape we parse when fetching. */
export const ModelsFetchResultSchema = z.object({
    providerId: z.string(),
    models: z.array(ModelSchema),
});
export type ModelsFetchResult = z.infer<typeof ModelsFetchResultSchema>;

/** A provider as seen over the wire. The actual secret is NEVER included. */
export const ProviderSchema = z.object({
    id: z.string(),
    name: z.string(),
    apiType: ApiTypeSchema,
    /** Must include `/v1` for the openai-* types (the SDK appends the path). */
    baseUrl: z.string(),
    /** Models this provider serves. Each carries an id (sent verbatim as the
     *  request `model`), a display name, and a group (maker, derived from the
     *  id: the segment before `/`, else the first `-`-segment). */
    models: z.array(ModelSchema),
    credential: CredentialSchema,
    enabled: z.boolean(),
    createdAt: z.number(),
});
export type Provider = z.infer<typeof ProviderSchema>;

/** Body for create/update a provider. `key` is the actual secret, accepted only
 *  when credential.source === "inline"; it is never returned on read. */
export const ProviderInputSchema = ProviderSchema.omit({
    id: true,
    createdAt: true,
}).extend({
    key: z.string().optional(),
});
export type ProviderInput = z.infer<typeof ProviderInputSchema>;

/** Role of a prompt block in an assistant's prompt list. `history` is a marker
 *  - not sent to the model - that says where the conversation history is
 *  spliced in. Blocks before it are the preamble; blocks after are appended. */
export const PromptRoleSchema = z.enum([
    "system",
    "user",
    "assistant",
    "history",
]);
export type PromptRole = z.infer<typeof PromptRoleSchema>;

export const PromptBlockSchema = z.object({
    id: z.string(),
    role: PromptRoleSchema,
    /** Short identifier shown in the editor (e.g. "Main", "Jailbreak"). */
    name: z.string(),
    /** Prompt text (empty for the history marker). */
    content: z.string(),
    enabled: z.boolean(),
});
export type PromptBlock = z.infer<typeof PromptBlockSchema>;

/** A persona/preset: a named, ordered list of prompt blocks. Each assistant
 *  owns its conversations (Cherry Studio-style). */
export const AssistantSchema = z.object({
    id: z.string(),
    name: z.string(),
    emoji: z.string(),
    description: z.string(),
    prompts: z.array(PromptBlockSchema),
    /** The provider + model this assistant uses. Both nullable (Cherry
     *  Studio-style): an assistant with no model bound won't run until one is
     *  picked - no silent fallback. Resolution lives in runChat. */
    providerId: z.string().nullable(),
    modelId: z.string().nullable(),
    createdAt: z.number(),
    updatedAt: z.number(),
});
export type Assistant = z.infer<typeof AssistantSchema>;

export const AssistantSummarySchema = AssistantSchema.omit({ prompts: true });
export type AssistantSummary = z.infer<typeof AssistantSummarySchema>;

export const AssistantInputSchema = AssistantSchema.omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
export type AssistantInput = z.infer<typeof AssistantInputSchema>;

export const SettingsSchema = z.object({
    defaultStream: z.boolean(),
    activeAssistantId: z.string().nullable(),
});
export type Settings = z.infer<typeof SettingsSchema>;
/** A settings patch (PUT /api/settings): every field optional. */
export const SettingsPatchSchema = SettingsSchema.partial();
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;

export const ConversationSummarySchema = z.object({
    id: z.string(),
    title: z.string(),
    createdAt: z.number(),
    updatedAt: z.number(),
    assistantId: z.string().nullable(),
    providerId: z.string().nullable(),
    model: z.string().nullable(),
    messageCount: z.number(),
});
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;

export const ConversationSchema = ConversationSummarySchema.extend({
    /** The loaded range only (the recent tail on open, grown via loadOlder).
     *  Older messages are fetched on demand - never the whole conversation. */
    messages: z.array(ChatMessageSchema),
    /** Older messages exist on the server beyond the loaded range. */
    hasMore: z.boolean(),
    /** seq of the oldest loaded message (cursor for loading older). */
    oldestSeq: z.number().nullable(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

/** Body for POST /api/conversations: start a new conversation, optionally
 *  pinned to an assistant + provider/model. */
export const ConversationCreateSchema = z.object({
    assistantId: z.string().nullable().optional(),
    title: z.string().optional(),
    providerId: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
});
export type ConversationCreate = z.infer<typeof ConversationCreateSchema>;

/** A page of older messages from GET /api/conversations/:id/messages?before=. */
export const MessagePageSchema = z.object({
    messages: z.array(ChatMessageSchema),
    hasMore: z.boolean(),
    oldestSeq: z.number().nullable(),
});
export type MessagePage = z.infer<typeof MessagePageSchema>;

export const ProviderTestResultSchema = z.object({
    ok: z.boolean(),
    error: z.string().optional(),
});
export type ProviderTestResult = z.infer<typeof ProviderTestResultSchema>;
