// SQLite persistence layer. Raw SQL via node:sqlite (Deno-native, no ORM).
//
// The DB file lives in a data dir (RAIRAI_DATA_DIR env, else ./data) and is
// chmod'd 0600 because inline provider credentials are stored in it. All
// access goes through the query/queryOne helpers below (they centralize the
// node:sqlite row-type cast).

import { DatabaseSync } from "node:sqlite";
import type {
    ApiType,
    Conversation,
    ConversationSummary,
    MessagePage,
    Provider,
    ProviderInput,
    Settings,
} from "../shared/api.ts";
import type { ChatMessage, ToolCall, TokenUsage } from "../shared/chat-events.ts";

const DATA_DIR = Deno.env.get("RAIRAI_DATA_DIR") ?? "./data";
const DB_PATH = `${DATA_DIR}/rairai.db`;

let db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
    if (db) return db;
    Deno.mkdirSync(DATA_DIR, { recursive: true });
    const d = new DatabaseSync(DB_PATH);
    d.exec("PRAGMA journal_mode = WAL;");
    d.exec("PRAGMA foreign_keys = ON;");
    migrate(d);
    try {
        Deno.chmodSync(DB_PATH, 0o600);
    } catch {
        // filesystems without chmod (e.g. some FAT) - non-fatal
    }
    db = d;
    return d;
}

type Bind = string | number | bigint | null | Uint8Array;

function query<T>(sql: string, ...params: Bind[]): T[] {
    return getDb().prepare(sql).all(...params) as unknown as T[];
}

function queryOne<T>(sql: string, ...params: Bind[]): T | undefined {
    return getDb().prepare(sql).get(...params) as unknown as T;
}

function run(sql: string, ...params: Bind[]): { changes: number } {
    return getDb().prepare(sql).run(...params) as { changes: number };
}

function migrate(d: DatabaseSync): void {
    d.exec(`
        CREATE TABLE IF NOT EXISTS providers (
            id                 TEXT PRIMARY KEY,
            name               TEXT NOT NULL,
            api_type           TEXT NOT NULL,
            base_url           TEXT NOT NULL,
            models             TEXT NOT NULL DEFAULT '[]',
            credential_source  TEXT NOT NULL,
            credential_ref     TEXT,
            credential_inline  TEXT,
            enabled            INTEGER NOT NULL DEFAULT 1,
            created_at         INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS conversations (
            id            TEXT PRIMARY KEY,
            title         TEXT NOT NULL,
            created_at    INTEGER NOT NULL,
            updated_at    INTEGER NOT NULL,
            provider_id   TEXT,
            model         TEXT,
            system_prompt TEXT
        );
        CREATE TABLE IF NOT EXISTS messages (
            id              TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            seq             INTEGER NOT NULL,
            role            TEXT NOT NULL,
            text            TEXT NOT NULL DEFAULT '',
            reasoning       TEXT,
            tool_calls      TEXT,
            model           TEXT,
            usage           TEXT,
            duration_ms     INTEGER,
            created_at      INTEGER NOT NULL,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, seq);
    `);
}

function uid(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// --- Providers ---------------------------------------------------------------

interface ProviderRow {
    id: string;
    name: string;
    api_type: string;
    base_url: string;
    models: string;
    credential_source: string;
    credential_ref: string | null;
    credential_inline: string | null;
    enabled: number;
    created_at: number;
}

function rowToProvider(r: ProviderRow): Provider {
    return {
        id: r.id,
        name: r.name,
        apiType: r.api_type as ApiType,
        baseUrl: r.base_url,
        models: JSON.parse(r.models) as string[],
        credential: {
            source: r.credential_source as "env" | "inline",
            ref: r.credential_ref ?? undefined,
        },
        enabled: r.enabled === 1,
        createdAt: r.created_at,
    };
}

export function listProviders(): Provider[] {
    return query<ProviderRow>(
        "SELECT * FROM providers ORDER BY created_at ASC",
    ).map(rowToProvider);
}

export function getProvider(id: string): Provider | null {
    const r = queryOne<ProviderRow>("SELECT * FROM providers WHERE id = ?", id);
    return r ? rowToProvider(r) : null;
}

/** Returns the actual secret for a provider (env value or stored inline). */
export function resolveProviderKey(id: string): string | null {
    const r = queryOne<{
        credential_source: string;
        credential_ref: string | null;
        credential_inline: string | null;
    }>(
        "SELECT credential_source, credential_ref, credential_inline FROM providers WHERE id = ?",
        id,
    );
    if (!r) return null;
    if (r.credential_source === "env") {
        return r.credential_ref ? (Deno.env.get(r.credential_ref) ?? null) : null;
    }
    return r.credential_inline;
}

export function createProvider(input: ProviderInput): Provider {
    const id = uid("prov");
    run(
        `INSERT INTO providers
         (id, name, api_type, base_url, models, credential_source, credential_ref, credential_inline, enabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        input.name,
        input.apiType,
        input.baseUrl,
        JSON.stringify(input.models),
        input.credential.source,
        input.credential.ref ?? null,
        input.credential.source === "inline" ? (input.key ?? null) : null,
        input.enabled ? 1 : 0,
        Date.now(),
    );
    return getProvider(id)!;
}

export function updateProvider(id: string, input: ProviderInput): Provider | null {
    const existing = queryOne<{ credential_inline: string | null }>(
        "SELECT credential_inline FROM providers WHERE id = ?",
        id,
    );
    if (!existing) return null;
    // Only rotate the inline key if a new one is supplied; keep the old one otherwise.
    const inlineKey = input.credential.source === "inline"
        ? (input.key ?? existing.credential_inline ?? null)
        : null;
    run(
        `UPDATE providers SET
            name = ?, api_type = ?, base_url = ?, models = ?,
            credential_source = ?, credential_ref = ?, credential_inline = ?,
            enabled = ?
         WHERE id = ?`,
        input.name,
        input.apiType,
        input.baseUrl,
        JSON.stringify(input.models),
        input.credential.source,
        input.credential.ref ?? null,
        inlineKey,
        input.enabled ? 1 : 0,
        id,
    );
    return getProvider(id);
}

export function deleteProvider(id: string): boolean {
    return run("DELETE FROM providers WHERE id = ?", id).changes > 0;
}

// --- Settings ----------------------------------------------------------------

const DEFAULT_SETTINGS: Settings = {
    defaultSystemPrompt: "You are a helpful assistant.",
    defaultStream: true,
    activeProviderId: null,
    activeModel: null,
};

export function getSettings(): Settings {
    const rows = query<{ key: string; value: string }>("SELECT key, value FROM settings");
    const map = new Map(rows.map((r) => [r.key, r.value]));
    return {
        defaultSystemPrompt: map.get("defaultSystemPrompt") ?? DEFAULT_SETTINGS.defaultSystemPrompt,
        defaultStream: map.has("defaultStream")
            ? map.get("defaultStream") === "true"
            : DEFAULT_SETTINGS.defaultStream,
        activeProviderId: map.get("activeProviderId") || null,
        activeModel: map.get("activeModel") || null,
    };
}

export function updateSettings(patch: Partial<Settings>): Settings {
    const upsert = (key: string, value: string) =>
        run(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            key,
            value,
        );
    if (patch.defaultSystemPrompt !== undefined) upsert("defaultSystemPrompt", patch.defaultSystemPrompt);
    if (patch.defaultStream !== undefined) upsert("defaultStream", patch.defaultStream ? "true" : "false");
    if (patch.activeProviderId !== undefined) upsert("activeProviderId", patch.activeProviderId ?? "");
    if (patch.activeModel !== undefined) upsert("activeModel", patch.activeModel ?? "");
    return getSettings();
}

// --- Conversations + messages ------------------------------------------------

interface ConvRow {
    id: string;
    title: string;
    created_at: number;
    updated_at: number;
    provider_id: string | null;
    model: string | null;
    system_prompt: string | null;
}

function rowToSummary(r: ConvRow, messageCount: number): ConversationSummary {
    return {
        id: r.id,
        title: r.title,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        providerId: r.provider_id,
        model: r.model,
        messageCount,
    };
}

export function listConversations(): ConversationSummary[] {
    const rows = query<ConvRow>("SELECT * FROM conversations ORDER BY updated_at DESC");
    const counts = query<{ conversation_id: string; n: number }>(
        "SELECT conversation_id, COUNT(*) AS n FROM messages GROUP BY conversation_id",
    );
    const countMap = new Map(counts.map((c) => [c.conversation_id, c.n]));
    return rows.map((r) => rowToSummary(r, countMap.get(r.id) ?? 0));
}

interface MsgRow {
    id: string;
    conversation_id: string;
    seq: number;
    role: string;
    text: string;
    reasoning: string | null;
    tool_calls: string | null;
    model: string | null;
    usage: string | null;
    duration_ms: number | null;
    created_at: number;
}

function rowToMessage(r: MsgRow): ChatMessage {
    return {
        id: r.id,
        role: r.role as "user" | "assistant",
        text: r.text,
        reasoning: r.reasoning ?? undefined,
        toolCalls: r.tool_calls ? (JSON.parse(r.tool_calls) as ToolCall[]) : undefined,
        model: r.model ?? undefined,
        usage: r.usage ? (JSON.parse(r.usage) as TokenUsage) : undefined,
        durationMs: r.duration_ms ?? undefined,
        createdAt: r.created_at,
    };
}

export function getConversation(id: string): Conversation | null {
    const r = queryOne<ConvRow>("SELECT * FROM conversations WHERE id = ?", id);
    if (!r) return null;
    const msgs = query<MsgRow>(
        "SELECT * FROM messages WHERE conversation_id = ? ORDER BY seq ASC",
        id,
    );
    const summary = rowToSummary(r, msgs.length);
    return {
        ...summary,
        systemPrompt: r.system_prompt,
        messages: msgs.map(rowToMessage),
        hasMore: false,
        oldestSeq: null,
    };
}

const PAGE_SIZE = 30;

/** Conversation meta + the recent message tail (NOT all messages). Used by the
 *  REST endpoint so opening a long conversation doesn't transfer everything. */
export function getConversationPage(id: string, limit = PAGE_SIZE): Conversation | null {
    const r = queryOne<ConvRow>("SELECT * FROM conversations WHERE id = ?", id);
    if (!r) return null;
    const total = queryOne<{ n: number }>(
        "SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?",
        id,
    )!.n;
    // Tail: newest N, then reverse to ascending for display.
    const tail = query<MsgRow>(
        "SELECT * FROM messages WHERE conversation_id = ? ORDER BY seq DESC LIMIT ?",
        id,
        limit,
    );
    const messages = tail.slice().reverse().map(rowToMessage);
    const oldestSeq = tail.length ? tail[tail.length - 1].seq : null;
    return {
        ...rowToSummary(r, total),
        systemPrompt: r.system_prompt,
        messages,
        hasMore: total > tail.length,
        oldestSeq,
    };
}

/** One page of messages older than `beforeSeq` (cursor pagination on scroll-up). */
export function getMessagesBefore(
    id: string,
    beforeSeq: number,
    limit = PAGE_SIZE,
): MessagePage {
    const total = queryOne<{ n: number }>(
        "SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND seq < ?",
        id,
        beforeSeq,
    )!.n;
    const rows = query<MsgRow>(
        "SELECT * FROM messages WHERE conversation_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?",
        id,
        beforeSeq,
        limit,
    );
    const messages = rows.slice().reverse().map(rowToMessage);
    const oldestSeq = rows.length ? rows[rows.length - 1].seq : null;
    return { messages, hasMore: total > rows.length, oldestSeq };
}

export function createConversation(input: {
    title?: string;
    providerId?: string | null;
    model?: string | null;
    systemPrompt?: string | null;
}): Conversation {
    const id = uid("conv");
    const now = Date.now();
    run(
        `INSERT INTO conversations (id, title, created_at, updated_at, provider_id, model, system_prompt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        id,
        input.title?.trim() || "New chat",
        now,
        now,
        input.providerId ?? null,
        input.model ?? null,
        input.systemPrompt ?? null,
    );
    return getConversation(id)!;
}

export function updateConversationTitle(id: string, title: string): void {
    run("UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?", title, Date.now(), id);
}

export function deleteConversation(id: string): boolean {
    return run("DELETE FROM conversations WHERE id = ?", id).changes > 0;
}

export function touchConversation(id: string): void {
    run("UPDATE conversations SET updated_at = ? WHERE id = ?", Date.now(), id);
}

/** Next sequence number for a conversation (messages are ordered by seq). */
function nextSeq(conversationId: string): number {
    const r = queryOne<{ m: number | null }>(
        "SELECT MAX(seq) AS m FROM messages WHERE conversation_id = ?",
        conversationId,
    );
    return (r?.m ?? 0) + 1;
}

export function addMessage(conversationId: string, msg: ChatMessage): void {
    run(
        `INSERT INTO messages
         (id, conversation_id, seq, role, text, reasoning, tool_calls, model, usage, duration_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        msg.id,
        conversationId,
        nextSeq(conversationId),
        msg.role,
        msg.text,
        msg.reasoning ?? null,
        msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
        msg.model ?? null,
        msg.usage ? JSON.stringify(msg.usage) : null,
        msg.durationMs ?? null,
        msg.createdAt,
    );
    touchConversation(conversationId);
}

// --- Bootstrap ---------------------------------------------------------------

/** On an empty provider table, seed one from env (if present) or a faux dev
 *  provider, so the app is usable on first run. */
export function ensureBootstrapProvider(): void {
    const count = queryOne<{ n: number }>("SELECT COUNT(*) AS n FROM providers")!;
    if (count.n > 0) return;
    const baseUrl = Deno.env.get("OPENAI_BASE_URL");
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    const created = (baseUrl && apiKey)
        ? createProvider({
            name: "OpenAI (from env)",
            apiType: "openai-completions",
            baseUrl,
            models: [Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini"],
            credential: { source: "env", ref: "OPENAI_API_KEY" },
            enabled: true,
        })
        : createProvider({
            name: "Faux (dev, no key)",
            apiType: "faux",
            baseUrl: "http://localhost:0",
            models: ["faux-1"],
            credential: { source: "inline" },
            enabled: true,
        });
    // Make the bootstrap provider active so chat works zero-config.
    if (getSettings().activeProviderId === null) {
        updateSettings({ activeProviderId: created.id, activeModel: created.models[0] ?? null });
    }
}
