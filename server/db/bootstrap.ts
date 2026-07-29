// First-run seeding: an env/faux provider + a default assistant, so the app
// is usable immediately. Called once on server startup.

import { toModel } from "../../shared/api.ts";
import { uid } from "../../shared/id.ts";
import { queryOne, run } from "./client.ts";
import { createProvider } from "./providers.ts";
import { createAssistant } from "./assistants.ts";
import { getSettings, updateSettings } from "./settings.ts";

/** On an empty provider table, seed one from env (if present) or a faux dev
 *  provider, so the app is usable on first run. Returns the created provider's
 *  id + first model, or null if a provider already existed. */
export function ensureBootstrapProvider(): {
    providerId: string;
    modelId: string;
} | null {
    const count = queryOne<{ n: number }>(
        "SELECT COUNT(*) AS n FROM providers",
    )!;
    if (count.n > 0) return null;
    const baseUrl = Deno.env.get("OPENAI_BASE_URL");
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    const created = (baseUrl && apiKey)
        ? createProvider({
            name: "OpenAI (from env)",
            apiType: "openai-completions",
            baseUrl,
            models: [toModel(Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini")],
            credential: { source: "env", ref: "OPENAI_API_KEY" },
            enabled: true,
        })
        : createProvider({
            name: "Faux (dev, no key)",
            apiType: "faux",
            baseUrl: "http://localhost:0",
            models: [toModel("faux-1")],
            credential: { source: "inline" },
            enabled: true,
        });
    return { providerId: created.id, modelId: created.models[0]?.id ?? "" };
}

/** Seed a default assistant on first run and make it active. Also adopts any
 *  conversations from a pre-assistant DB (assistant_id IS NULL) into it, and
 *  binds the bootstrap provider+model so chat works zero-config. */
export function ensureBootstrapAssistant(
    bootstrap?: { providerId: string; modelId: string } | null,
): void {
    const count = queryOne<{ n: number }>(
        "SELECT COUNT(*) AS n FROM assistants",
    )!;
    let defaultId: string;
    if (count.n > 0) {
        defaultId = queryOne<{ id: string }>(
            "SELECT id FROM assistants ORDER BY created_at ASC LIMIT 1",
        )!
            .id;
    } else {
        const created = createAssistant({
            name: "Default",
            emoji: "✨",
            description: "The default assistant.",
            prompts: [
                {
                    id: uid("blk"),
                    role: "system",
                    name: "Main",
                    content: "You are a helpful assistant.",
                    enabled: true,
                },
                {
                    id: uid("blk"),
                    role: "history",
                    name: "History",
                    content: "",
                    enabled: true,
                },
            ],
            providerId: bootstrap?.providerId ?? null,
            modelId: bootstrap?.modelId ?? null,
        });
        defaultId = created.id;
    }
    if (getSettings().activeAssistantId === null) {
        updateSettings({ activeAssistantId: defaultId });
    }
    // Adopt orphaned conversations (pre-assistant DBs) into the default assistant.
    run(
        "UPDATE conversations SET assistant_id = ? WHERE assistant_id IS NULL",
        defaultId,
    );
}
