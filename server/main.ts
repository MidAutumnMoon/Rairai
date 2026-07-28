import { Hono } from "@hono/hono";
import { stream } from "@hono/hono/streaming";
import { Agent } from "@earendil-works/pi-agent-core";
import { runChat } from "./llm/agent.ts";
import { resolveProviderModel } from "./llm/providers.ts";
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
    getProvider,
    getSettings,
    listAssistants,
    listConversations,
    listProviders,
    updateAssistant,
    updateProvider,
    updateSettings,
} from "./db.ts";
import { sseLine, type ChatRequest, type ServerEvent } from "../shared/chat-events.ts";
import type { AssistantInput, ProviderInput, Settings } from "../shared/api.ts";
import { messageOf } from "../shared/error.ts";

const app = new Hono();

// Seed an env/faux provider + a default assistant on first run so the app is
// usable immediately.
ensureBootstrapProvider();
ensureBootstrapAssistant();

app.get("/api/health", (c) => c.json({ ok: true }));

// --- Providers (secrets never returned) --------------------------------------

app.get("/api/providers", (c) => c.json(listProviders()));

app.post("/api/providers", async (c) => {
    const input = (await c.req.json()) as ProviderInput;
    return c.json(createProvider(input), 201);
});

app.put("/api/providers/:id", async (c) => {
    const input = (await c.req.json()) as ProviderInput;
    const p = updateProvider(c.req.param("id"), input);
    return p ? c.json(p) : c.json({ error: "not found" }, 404);
});

app.delete("/api/providers/:id", (c) => {
    const id = c.req.param("id");
    const deleted = deleteProvider(id);
    if (deleted && getSettings().activeProviderId === id) {
        updateSettings({ activeProviderId: null, activeModel: null });
    }
    return deleted ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
});

app.post("/api/providers/:id/test", async (c) => {
    try {
        return c.json(await testProvider(c.req.param("id")));
    } catch (e) {
        return c.json({ ok: false, error: messageOf(e) });
    }
});

// --- Settings ----------------------------------------------------------------

app.get("/api/settings", (c) => c.json(getSettings()));

app.put("/api/settings", async (c) => {
    const patch = (await c.req.json()) as Partial<Settings>;
    return c.json(updateSettings(patch));
});

// --- Assistants ---------------------------------------------------------------

app.get("/api/assistants", (c) => c.json(listAssistants()));

app.get("/api/assistants/:id", (c) => {
    const a = getAssistant(c.req.param("id"));
    return a ? c.json(a) : c.json({ error: "not found" }, 404);
});

app.post("/api/assistants", async (c) => {
    const input = (await c.req.json()) as AssistantInput;
    return c.json(createAssistant(input), 201);
});

app.put("/api/assistants/:id", async (c) => {
    const input = (await c.req.json()) as AssistantInput;
    const a = updateAssistant(c.req.param("id"), input);
    return a ? c.json(a) : c.json({ error: "not found" }, 404);
});

app.delete("/api/assistants/:id", (c) => {
    const id = c.req.param("id");
    const deleted = deleteAssistant(id);
    if (deleted && getSettings().activeAssistantId === id) {
        updateSettings({ activeAssistantId: null });
    }
    return deleted ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
});

// --- Conversations -----------------------------------------------------------

app.get("/api/conversations", (c) => c.json(listConversations(c.req.query("assistantId") || undefined)));

app.post("/api/conversations", async (c) => {
    const input = (await c.req.json().catch(() => ({}))) as { assistantId?: string; title?: string };
    return c.json(createConversation(input), 201);
});

app.get("/api/conversations/:id", (c) => {
    const conv = getConversationPage(c.req.param("id"));
    return conv ? c.json(conv) : c.json({ error: "not found" }, 404);
});

app.get("/api/conversations/:id/messages", (c) => {
    const before = Number(c.req.query("before"));
    const limit = Number(c.req.query("limit")) || 30;
    if (!Number.isFinite(before)) return c.json({ error: "missing or invalid 'before'" }, 400);
    return c.json(getMessagesBefore(c.req.param("id"), before, limit));
});

app.delete("/api/conversations/:id", (c) =>
    deleteConversation(c.req.param("id")) ? c.json({ ok: true }) : c.json({ error: "not found" }, 404),
);

// --- Chat (SSE) --------------------------------------------------------------

app.post("/api/chat", (c) => {
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

        let req: ChatRequest;
        try {
            req = await c.req.json();
        } catch (e) {
            await s.write(sseLine({ type: "error", message: `Invalid request body: ${e}` }));
            return;
        }

        try {
            await runChat(req, (ev) => { try { s.write(sseLine(ev)); } catch { /* client gone */ } }, signal);
        } catch (e) {
            const err: ServerEvent = {
                type: "error",
                message: messageOf(e),
            };
            await s.write(sseLine(err));
        }
    });
});

/** Resolve a provider and run a one-token probe to verify the credential + endpoint. */
function testProvider(id: string): Promise<{ ok: boolean; error?: string }> {
    const p = getProvider(id);
    if (!p) return Promise.resolve({ ok: false, error: "provider not found" });
    const { models, model } = resolveProviderModel(id, p.models[0] ?? null);
    const { promise, resolve } = Promise.withResolvers<{ ok: boolean; error?: string }>();
    let settled = false;
    const settle = (ok: boolean, error?: string) => {
        if (settled) return;
        settled = true;
        resolve({ ok, error });
    };
    const agent = new Agent({
        initialState: { systemPrompt: "You are a connection test.", model, tools: [] },
        streamFn: models.streamSimple.bind(models),
    });
    const unsub = agent.subscribe((ev) => {
        if (ev.type === "message_update" && ev.assistantMessageEvent.type === "text_delta") {
            settle(true);
        } else if (
            ev.type === "message_end" &&
            ev.message.role === "assistant" &&
            (ev.message.stopReason === "error" || ev.message.stopReason === "aborted")
        ) {
            settle(false, ev.message.errorMessage ?? "error");
        }
    });
    const timer = setTimeout(() => {
        settle(false, "timeout (15s)");
        agent.abort();
    }, 15000);
    agent
        .prompt("Reply with exactly: ok")
        .then(() => {
            clearTimeout(timer);
            unsub();
            settle(true);
        })
        .catch((e) => {
            clearTimeout(timer);
            unsub();
            settle(false, messageOf(e));
        });
    return promise;
}

Deno.serve({ port: 36500 }, app.fetch);
