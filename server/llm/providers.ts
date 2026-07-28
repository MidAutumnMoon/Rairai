// Provider + model resolution for the chat backend.
//
// Two modes:
//   - Gateway (real): when OPENAI_BASE_URL + OPENAI_API_KEY are set, target an
//     OpenAI-compatible endpoint via the Chat Completions API (/v1/chat/completions).
//   - Faux (dev): otherwise, use pi-ai's built-in `faux` provider - no keys, no
//     network. Faux errors if its response queue is empty, so we script a
//     dynamic echo-with-reasoning response per request.
//
// All LLM HTTP happens here, server-side - the browser never touches the
// provider, so there is no CORS surface.

import {
    createModels,
    createProvider,
    envApiKeyAuth,
    type Model,
    type MutableModels,
} from "@earendil-works/pi-ai";
import { fauxProvider, fauxAssistantMessage, fauxThinking } from "@earendil-works/pi-ai/providers/faux";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import type { Context } from "@earendil-works/pi-ai";

export interface ResolvedProvider {
    models: MutableModels;
    model: Model<string>;
    label: string;
}

export function resolveProvider(): ResolvedProvider {
    const baseUrl = Deno.env.get("OPENAI_BASE_URL");
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (baseUrl && apiKey) return makeGateway(baseUrl);
    return makeFaux();
}

function makeFaux(): ResolvedProvider {
    const handle = fauxProvider();
    // Script a dynamic response: echo the user's last message with a short
    // reasoning block, so the dev mode exercises streaming + reasoning + the
    // network inspector without any real provider.
    handle.setResponses([
        (_context: Context) => {
            const userText = lastUserText(_context);
            return fauxAssistantMessage(
                [
                    fauxThinking(`The user said: "${userText}". Echoing back.`),
                    { type: "text", text: `[faux echo] ${userText}` },
                ],
                { stopReason: "stop" },
            );
        },
    ]);
    const models = createModels();
    models.setProvider(handle.provider);
    const model = handle.getModel("faux-1")!;
    return { models, model, label: "faux" };
}

function makeGateway(baseUrl: string): ResolvedProvider {
    // baseUrl MUST include the "/v1" segment - the OpenAI SDK appends
    // "/chat/completions" to it (not "/v1/chat/completions").
    const modelId = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";
    const providerId = "openai-gateway";
    const model: Model<"openai-completions"> = {
        id: modelId,
        name: modelId,
        api: "openai-completions", // -> POST {baseUrl}/chat/completions
        provider: providerId,
        baseUrl,
        reasoning: false, // safest for an unknown gateway; skips thinking-format branches
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 32768,
        maxTokens: 4096,
    };
    const provider = createProvider({
        id: providerId,
        baseUrl,
        auth: { apiKey: envApiKeyAuth("OpenAI-compatible key", ["OPENAI_API_KEY"]) },
        models: [model],
        api: openAICompletionsApi(),
    });
    const models = createModels();
    models.setProvider(provider); // required: streamSimple looks up the provider by id
    return { models, model, label: `gateway:${modelId}` };
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
