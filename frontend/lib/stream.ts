// SSE transport: stream ServerEvents from POST /api/chat by parsing the SSE
// wire format. Extracted from the reactive store (chat.svelte.ts) so the store
// is state + event application, and transport is transport.

import type { ChatRequest, ServerEvent } from "$shared/chat-events.ts";
import { ServerEventSchema } from "$shared/chat-events.ts";
import { chatPath } from "./api.ts";

export async function streamChat(
    req: ChatRequest,
    onEvent: (e: ServerEvent) => void,
    signal: AbortSignal,
): Promise<void> {
    const res = await fetch(chatPath(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req),
        signal,
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) >= 0) {
            const frame = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            const line = frame.trim();
            if (line.startsWith("data: ")) {
                try {
                    const ev = ServerEventSchema.safeParse(
                        JSON.parse(line.slice(6)),
                    );
                    if (ev.success) onEvent(ev.data);
                    // a schema-invalid event is skipped, not thrown: one bad
                    // frame must not kill an in-progress stream.
                } catch {
                    // ignore malformed frames (partial flushes / bad JSON)
                }
            }
        }
    }
}
