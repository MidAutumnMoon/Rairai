// Shared coercion of a thrown value to a displayable string. Used by both the
// server (route error envelopes, SSE error events) and the client (store error
// state, settings error banners) so error formatting never drifts.

export function messageOf(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}
