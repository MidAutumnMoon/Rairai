import { Hono } from "@hono/hono";
import { stream } from "@hono/hono/streaming";
import { runChat } from "./llm/agent.ts";
import { resolveProvider } from "./llm/providers.ts";
import { sseLine, type ChatRequest, type ServerEvent } from "../shared/chat-events.ts";

const app = new Hono();

app.get("/api/health", (c) => {
    const { label } = resolveProvider();
    return c.json({ ok: true, provider: label });
});

// Chat endpoint: POST a ChatRequest, receive a ServerEvent stream over SSE.
app.post("/api/chat", (c) => {
    c.header("Content-Type", "text/event-stream");
    c.header("Cache-Control", "no-cache");
    c.header("Connection", "keep-alive");
    c.header("X-Accel-Buffering", "no"); // disable proxy buffering (nginx etc.)

    return stream(c, async (s) => {
        const abortCtl = new AbortController();
        s.onAbort(() => abortCtl.abort());

        let req: ChatRequest;
        try {
            req = await c.req.json();
        } catch (e) {
            const err: ServerEvent = { type: "error", message: `Invalid request body: ${e}` };
            await s.write(sseLine(err));
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

Deno.serve({ port: 36500 }, app.fetch);
