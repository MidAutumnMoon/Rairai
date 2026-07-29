// Provider + model resolution, now backed by the DB (providers table) with
// per-provider credential resolution:
//   - env:    the key is read from a named env var at call time (never stored).
//   - inline: the key is stored in the DB (0600) and resolved per call.
// On an empty provider table we bootstrap one from env (or a faux dev provider).
//
// All LLM HTTP happens here, server-side - no CORS, secrets never leave the server.

import {
    type ApiKeyAuth,
    createModels,
    createProvider,
    envApiKeyAuth,
    type Model,
    type MutableModels,
} from "@earendil-works/pi-ai";
import {
    fauxAssistantMessage,
    fauxProvider,
    fauxThinking,
} from "@earendil-works/pi-ai/providers/faux";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import type { Context } from "@earendil-works/pi-ai";
import type { ApiType, ModelsFetchResult } from "../../shared/api.ts";
import { getProvider, groupOf, resolveProviderKey } from "../db.ts";
import type { Model as WireModel } from "../../shared/api.ts";

export interface ResolvedModel {
    models: MutableModels;
    model: Model<string>;
    label: string;
}

function apiLazy(type: ApiType) {
    switch (type) {
        case "openai-completions":
            return openAICompletionsApi();
        case "openai-responses":
            return openAIResponsesApi();
        case "anthropic-messages":
            return anthropicMessagesApi();
        case "faux":
            throw new Error("faux providers are resolved before API lookup");
    }
}

function lastUserText(context: Context): string {
    for (let i = context.messages.length - 1; i >= 0; i--) {
        const m = context.messages[i];
        if (m.role !== "user") continue;
        if (typeof m.content === "string") return m.content;
        return m.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    }
    return "(no user message)";
}

/** Resolve a DB provider + model id into a runnable pi Models/Model pair.
 *  Builds a fresh provider per call (cheap, no network) so credential rotation
 *  and model-list edits always take effect. */
export function resolveProviderModel(
    providerId: string,
    modelId: string | null,
): ResolvedModel {
    const p = getProvider(providerId);
    if (!p) throw new Error(`Unknown provider: ${providerId}`);
    if (!p.enabled) throw new Error(`Provider "${p.name}" is disabled`);
    const resolvedModelId = modelId ?? p.models[0]?.id;
    if (!resolvedModelId) {
        throw new Error(`Provider "${p.name}" has no models configured`);
    }

    if (p.credential.source === "env" && !p.credential.ref) {
        throw new Error(
            `Provider "${p.name}" uses an env credential but has no env var name.`,
        );
    }

    // Faux is a special dev provider built via fauxProvider() (scripted echo).
    if (p.apiType === "faux") {
        const handle = fauxProvider();
        handle.setResponses([
            (_ctx: Context) =>
                fauxAssistantMessage(
                    [
                        fauxThinking(
                            `The user said: "${
                                lastUserText(_ctx)
                            }". Echoing back.`,
                        ),
                        {
                            type: "text",
                            text: `[faux echo] ${lastUserText(_ctx)}`,
                        },
                    ],
                    { stopReason: "stop" },
                ),
        ]);
        const models = createModels();
        models.setProvider(handle.provider);
        const model = handle.getModel(resolvedModelId) ?? handle.getModel()!;
        return { models, model, label: `faux:${resolvedModelId}` };
    }

    const key = resolveProviderKey(p.id);
    if (!key) {
        const hint = p.credential.source === "env"
            ? ` (env var "${p.credential.ref}" is not set)`
            : " (no inline key stored)";
        throw new Error(
            `Provider "${p.name}" has no resolved credential${hint}`,
        );
    }

    const model: Model<string> = {
        id: resolvedModelId,
        name: resolvedModelId,
        api: p.apiType,
        provider: p.id,
        baseUrl: p.baseUrl,
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 32768,
        maxTokens: 4096,
    };

    // Inline keys use a resolver that returns the stored value; env keys resolve
    // from the named env var via envApiKeyAuth.
    const auth: { apiKey: ApiKeyAuth } = p.credential.source === "env"
        ? { apiKey: envApiKeyAuth(p.name, [p.credential.ref ?? ""]) }
        : {
            apiKey: {
                name: p.name,
                resolve: () => Promise.resolve({ auth: { apiKey: key } }),
            },
        };

    const provider = createProvider({
        id: p.id,
        baseUrl: p.baseUrl,
        auth,
        models: [model],
        api: apiLazy(p.apiType),
    });
    const models = createModels();
    models.setProvider(provider);
    return { models, model, label: `${p.name}:${resolvedModelId}` };
}

/** Fetch a provider's model list from its API (OpenAI-compatible `GET
 *  {baseUrl}/models`). Returns models with derived groups (maker). Faux
 *  providers have no API to query - they return their configured models. */
export async function fetchProviderModels(
    providerId: string,
): Promise<ModelsFetchResult> {
    const p = getProvider(providerId);
    if (!p) throw new Error(`Unknown provider: ${providerId}`);
    if (!p.enabled) throw new Error(`Provider "${p.name}" is disabled`);

    if (p.apiType === "faux") {
        return { providerId, models: p.models };
    }

    // The key is optional for the models-list fetch: many gateways (OpenRouter,
    // Ollama, local servers) expose /models publicly. Send auth only if a key
    // resolves; a missing key is still an error at chat time (resolveProviderModel).
    const key = resolveProviderKey(p.id);
    const url = `${p.baseUrl.replace(/\/$/, "")}/models`;
    const headers: Record<string, string> = {};
    if (key) headers.authorization = `Bearer ${key}`;
    const res = await fetch(url, { method: "GET", headers });
    if (!res.ok) {
        throw new Error(
            `Fetching models failed: HTTP ${res.status} ${await res.text()}`,
        );
    }
    const body = await res.json() as {
        data?: { id?: string; name?: string }[];
    };
    const fetched: WireModel[] = (body.data ?? [])
        .filter((m) => m && typeof m.id === "string")
        .map((m) => {
            const id = m.id!;
            return { id, name: m.name ?? id, group: groupOf(id) };
        });
    return { providerId, models: fetched };
}
