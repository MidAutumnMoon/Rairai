// Shared id generator. Used by the backend (db rows, messages, network logs)
// and the frontend (optimistic local ids). Both sides must agree on the shape
// so a client-generated id never collides with a server-generated one in the
// same message list (the store keys optimistic messages by id until the
// `done` event replaces them with the persisted record).

export function uid(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
