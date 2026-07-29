import { type Context, Hono } from "@hono/hono";
import { stream } from "@hono/hono/streaming";
import { z, ZodError, type ZodIssue, type ZodType } from "zod";
import { runChat } from "./llm/agent.ts";
import { fetchProviderModels, testProvider } from "./llm/providers.ts";
import {
    createAssistant,
    createConversation,
    createProvider,
    deleteAssistant,
    deleteConversation,
    deleteProvider,
    ensureBootstrapAssistant,
    ensureBootstrapProvider,
    getAssistant,
    getConversationPage,
    getMessagesBefore,
    getSettings,
    listAssistants,
    listConversations,
    listProviders,
    setProviderModels,
    updateAssistant,
    updateProvider,
    updateSettings,
} from "./db/mod.ts";
import {
    ChatRequestSchema,
    type ServerEvent,
    sseLine,
} from "../shared/chat-events.ts";
import {
    AssistantInputSchema,
    ConversationCreateSchema,
    ProviderInputSchema,
    SettingsPatchSchema,
} from "../shared/api.ts";
import { routes } from "../shared/routes.ts";
import { messageOf } from "../shared/error.ts";

const app = new Hono();

/** A request body that failed its schema. Mapped to 400 by onError - distinct
 *  from a bare ZodError, which reaches here only from the DB layer (a stored
 *  row that doesn't match its schema) and is a 500 server-data fault. */
class ValidationError extends Error {
    constructor(public issues: ZodIssue[]) {
        super("request body validation failed");
        this.name = "ValidationError";
    }
}

/** Read + validate a JSON request body against a schema; throws ValidationError
 *  (-> 400) on a bad body. Centralizes fetch->parse->validate so routes stay
 *  declarative and no body reaches the DB layer unvalidated. */
async function body<T>(c: Context, schema: ZodType<T>): Promise<T> {
    const raw = await c.req.json().catch(() => null);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    return parsed.data;
}

app.onError((e, c) => {
    if (e instanceof ValidationError) {
        return c.json({ error: "invalid request body", issues: e.issues }, 400);
    }
    if (e instanceof ZodError) {
        // A ZodError escaping a route is from the DB layer (a stored row that
        // doesn't match its schema) - a server data fault, not a client error.
        return c.json({
            error: "stored data failed validation",
            issues: e.issues,
        }, 500);
    }
    return c.json({ error: messageOf(e) }, 500);
});

// Seed an env/faux provider + a default assistant on first run so the app is
// usable immediately.
const bootstrapProvider = ensureBootstrapProvider();
ensureBootstrapAssistant(bootstrapProvider);

app.get("/api/health", (c) => c.json({ ok: true }));

// --- Providers (secrets never returned) --------------------------------------
app.get(`/api${routes["providers.list"].path}`, (c) => c.json(listProviders()));

app.post(`/api${routes["providers.create"].path}`, async (c) => {
    const input = await body(c, ProviderInputSchema);
    return c.json(createProvider(input), 201);
});

app.put(`/api${routes["providers.update"].path}`, async (c) => {
    const input = await body(c, ProviderInputSchema);
    const p = updateProvider(c.req.param("id"), input);
    return p ? c.json(p) : c.json({ error: "not found" }, 404);
});

app.delete(`/api${routes["providers.delete"].path}`, (c) => {
    const deleted = deleteProvider(c.req.param("id"));
    return deleted ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
});

app.post(`/api${routes["providers.test"].path}`, async (c) => {
    try {
        return c.json(await testProvider(c.req.param("id")));
    } catch (e) {
        return c.json({ ok: false, error: messageOf(e) });
    }
});

// Fetch a provider's model list from its API (OpenAI-compatible /models) and
// store it. Returns the fetched models; the caller's UI can then pick one.
app.post(`/api${routes["providers.fetchModels"].path}`, async (c) => {
    try {
        const result = await fetchProviderModels(c.req.param("id"));
        setProviderModels(result.providerId, result.models);
        return c.json(result);
    } catch (e) {
        return c.json({ error: messageOf(e) }, 500);
    }
});

// --- Settings ----------------------------------------------------------------

app.get(`/api${routes["settings.get"].path}`, (c) => c.json(getSettings()));

app.put(`/api${routes["settings.update"].path}`, async (c) => {
    const patch = await body(c, SettingsPatchSchema);
    return c.json(updateSettings(patch));
});

// --- Assistants ---------------------------------------------------------------

app.get(
    `/api${routes["assistants.list"].path}`,
    (c) => c.json(listAssistants()),
);

app.get(`/api${routes["assistants.get"].path}`, (c) => {
    const a = getAssistant(c.req.param("id"));
    return a ? c.json(a) : c.json({ error: "not found" }, 404);
});

app.post(`/api${routes["assistants.create"].path}`, async (c) => {
    const input = await body(c, AssistantInputSchema);
    return c.json(createAssistant(input), 201);
});

app.put(`/api${routes["assistants.update"].path}`, async (c) => {
    const input = await body(c, AssistantInputSchema);
    const a = updateAssistant(c.req.param("id"), input);
    return a ? c.json(a) : c.json({ error: "not found" }, 404);
});

app.delete(`/api${routes["assistants.delete"].path}`, (c) => {
    const id = c.req.param("id");
    const deleted = deleteAssistant(id);
    if (deleted && getSettings().activeAssistantId === id) {
        updateSettings({ activeAssistantId: null });
    }
    return deleted ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
});

// --- Conversations -----------------------------------------------------------

app.get(
    `/api${routes["conversations.list"].path}`,
    (c) => c.json(listConversations(c.req.query("assistantId") || undefined)),
);

app.post(`/api${routes["conversations.create"].path}`, async (c) => {
    const input = await body(c, ConversationCreateSchema);
    return c.json(createConversation(input), 201);
});

app.get(`/api${routes["conversations.get"].path}`, (c) => {
    const conv = getConversationPage(c.req.param("id"));
    return conv ? c.json(conv) : c.json({ error: "not found" }, 404);
});

app.get(`/api${routes["conversations.messages"].path}`, (c) => {
    const parsed = z.object({
        before: z.coerce.number().int(),
        limit: z.coerce.number().int().optional().default(30),
    }).safeParse({
        before: c.req.query("before"),
        limit: c.req.query("limit"),
    });
    if (!parsed.success) {
        return c.json({
            error: "missing or invalid 'before'",
            issues: parsed.error.issues,
        }, 400);
    }
    return c.json(
        getMessagesBefore(
            c.req.param("id"),
            parsed.data.before,
            parsed.data.limit,
        ),
    );
});

app.delete(
    `/api${routes["conversations.delete"].path}`,
    (c) =>
        deleteConversation(c.req.param("id"))
            ? c.json({ ok: true })
            : c.json({ error: "not found" }, 404),
);

// --- Chat (SSE) --------------------------------------------------------------
// The body is validated before the stream starts: a bad request gets a clean
// 400, not a half-open SSE connection. Mid-stream errors become `error` events.

app.post(`/api${routes["chat.send"].path}`, async (c) => {
    const req = await body(c, ChatRequestSchema);
    c.header("Content-Type", "text/event-stream");
    c.header("Cache-Control", "no-cache");
    c.header("Connection", "keep-alive");
    c.header("X-Accel-Buffering", "no");

    return stream(c, async (s) => {
        const abortCtl = new AbortController();
        s.onAbort(() => abortCtl.abort());
        // Backstop: if the provider stalls (client still connected but no
        // progress for 10+ min), abort so the connection can't hang forever.
        const signal = AbortSignal.any([
            abortCtl.signal,
            AbortSignal.timeout(10 * 60 * 1000),
        ]);

        try {
            await runChat(req, (ev) => {
                try {
                    s.write(sseLine(ev));
                } catch { /* client gone */ }
            }, signal);
        } catch (e) {
            const err: ServerEvent = {
                type: "error",
                message: messageOf(e),
            };
            await s.write(sseLine(err));
        }
    });
});

Deno.serve({ port: 36500 }, app.fetch);
