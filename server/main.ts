import { Hono } from "@hono/hono";

const app = new Hono();

app.get("/api", async (ctx) => {
    ctx.text("hello hono");
});

Deno.serve({ port: 36500 }, app.fetch);
