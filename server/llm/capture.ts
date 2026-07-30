// Network capture: records one outbound LLM HTTP call (one assistant turn)
// for the request inspector. The lifecycle is begin() (streamFn starts) ->
// trackChunk() (each delta) -> finalize() (assistant message completes); that
// ordering is the invariant the agent loop relies on.

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { NetworkLog } from "$shared/chat-events.ts";

export class NetworkCapture {
    private id = "";
    private start = 0;
    private request: NetworkLog["request"] | null = null;
    private chunks: { timestamp: number; data: string }[] = [];

    begin(request: NetworkLog["request"]): void {
        this.id = `nl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        this.start = Date.now();
        this.request = request;
        this.chunks = [];
    }

    trackChunk(delta: string): void {
        this.chunks.push({ timestamp: Date.now(), data: delta });
    }

    finalize(am: AssistantMessage): NetworkLog {
        const isError = am.stopReason === "error" ||
            am.stopReason === "aborted";
        return {
            id: this.id,
            timestamp: this.start,
            request: this.request!,
            response: {
                status: isError ? 500 : 200,
                statusText: isError ? (am.errorMessage ?? "error") : "OK",
                headers: {},
                body: am,
                isStream: true,
                streamChunks: this.chunks,
            },
            error: isError ? { message: am.errorMessage ?? "error" } : null,
            durationMs: Date.now() - this.start,
            status: isError ? "error" : "success",
        };
    }
}
