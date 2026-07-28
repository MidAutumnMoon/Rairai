import { Hono } from "@hono/hono";
import { stream } from "@hono/hono/streaming";
import { Agent } from "@earendil-works/pi-agent-core";
import { runChat } from "./llm/agent.ts";
import { resolveProviderModel } from "./llm/providers.ts";
import {
    createConversation,
    createProvider,
    deleteConversation,
    deleteProvider,
    ensureBootstrapProvider,
    getConversation,
    getProvider,
    getSettings,
    listConversations,
    listProviders,
    updateProvider,
    updateSettings,
} from "./db.ts";
import { sseLine, type ChatRequest, type ServerEvent } from "../shared/chat-events.ts";
import type { ProviderInput, Settings } from "../shared/api.ts";

const app = new Hono();

// Seed an env/faux provider on first run so the app is usable immediately.
ensureBootstrapProvider();

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
        return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
});

// --- Settings ----------------------------------------------------------------

app.get("/api/settings", (c) => c.json(getSettings()));

app.put("/api/settings", async (c) => {
    const patch = (await c.req.json()) as Partial<Settings>;
    return c.json(updateSettings(patch));
});

// --- Conversations -----------------------------------------------------------

app.get("/api/conversations", (c) => c.json(listConversations()));

app.post("/api/conversations", async (c) => {
    const input = (await c.req.json().catch(() => ({}))) as { title?: string };
    return c.json(createConversation(input), 201);
});

app.get("/api/conversations/:id", (c) => {
    const conv = getConversation(c.req.param("id"));
    return conv ? c.json(conv) : c.json({ error: "not found" }, 404);
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

        let req: ChatRequest;
        try {
            req = await c.req.json();
        } catch (e) {
            await s.write(sseLine({ type: "error", message: `Invalid request body: ${e}` }));
            return;
        }

        try {
            await runChat(req, (ev) => s.write(sseLine(ev)), abortCtl.signal);
        } catch (e) {
            const err: ServerEvent = {
                type: "error",
                message: e instanceof Error ? e.message : String(e),
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
            settle(false, e instanceof Error ? e.message : String(e));
        });
    return promise;
}

Deno.serve({ port: 36500 }, app.fetch);
