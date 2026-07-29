// SQLite persistence layer. Raw SQL via node:sqlite (Deno-native, no ORM).
//
// The DB file lives in a data dir (RAIRAI_DATA_DIR env, else ./data) and is
// chmod'd 0600 because inline provider credentials are stored in it. All
// access goes through the query/queryOne helpers below (they centralize the
// node:sqlite row-type cast).

import { DatabaseSync } from "node:sqlite";
import {
    type Assistant,
    type AssistantInput,
    AssistantSchema,
    type AssistantSummary,
    AssistantSummarySchema,
    type Conversation,
    type ConversationCreate,
    type ConversationSummary,
    ConversationSummarySchema,
    type MessagePage,
    type Model,
    ModelSchema,
    type Provider,
    type ProviderInput,
    ProviderSchema,
    type Settings,
    type SettingsPatch,
    SettingsPatchSchema,
    SettingsSchema,
} from "../shared/api.ts";
import { type ChatMessage, ChatMessageSchema } from "../shared/chat-events.ts";
import { uid } from "../shared/id.ts";

/** Derive a model's maker/group from its id: the segment before `/`, else the
 *  first `-`-segment (Cherry Studio's derivation). Used when fetching models
 *  from an API and when migrating legacy `string[]` model lists. */
export function groupOf(modelId: string): string {
    const slash = modelId.split("/");
    if (slash.length > 1) return slash[0];
    const dash = modelId.split("-");
    return dash[0] || "other";
}

/** Build a Model from a bare id (name == id, group derived). */
export function toModel(id: string): Model {
    return ModelSchema.parse({ id, name: id, group: groupOf(id) });
}

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

function hasColumn(d: DatabaseSync, table: string, col: string): boolean {
    const rows = d.prepare(`PRAGMA table_info(${table})`).all() as {
        name: string;
    }[];
    return rows.some((r) => r.name === col);
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
        CREATE TABLE IF NOT EXISTS assistants (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            emoji       TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            prompts     TEXT NOT NULL DEFAULT '[]',
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS conversations (
            id            TEXT PRIMARY KEY,
            title         TEXT NOT NULL,
            created_at    INTEGER NOT NULL,
            updated_at    INTEGER NOT NULL,
            assistant_id TEXT,
            provider_id   TEXT,
            model         TEXT,
            FOREIGN KEY (assistant_id) REFERENCES assistants(id) ON DELETE SET NULL
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
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
            UNIQUE(conversation_id, seq)
        );
        CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, seq);
    `);
    // Pre-assistant DBs lack the assistant_id column; add it idempotently.
    if (!hasColumn(d, "conversations", "assistant_id")) {
        d.exec("ALTER TABLE conversations ADD COLUMN assistant_id TEXT");
    }
    // Provider/model binding moved onto the assistant. Pre-binding DBs lack
    // these columns; add them idempotently (nullable - no silent fallback).
    if (!hasColumn(d, "assistants", "provider_id")) {
        d.exec("ALTER TABLE assistants ADD COLUMN provider_id TEXT");
    }
    if (!hasColumn(d, "assistants", "model_id")) {
        d.exec("ALTER TABLE assistants ADD COLUMN model_id TEXT");
    }
    // One-time: migrate legacy `string[]` model lists on providers to the
    // richer `Model[]` shape ({ id, name, group }). Idempotent - rows already
    // in the new shape (objects with an `id`) are left as-is.
    const providers = d.prepare("SELECT id, models FROM providers").all() as {
        id: string;
        models: string;
    }[];
    for (const p of providers) {
        let parsed: unknown;
        try {
            parsed = JSON.parse(p.models);
        } catch {
            continue;
        }
        if (!Array.isArray(parsed)) continue;
        const needsMigrate = parsed.some(
            (m) => typeof m === "string",
        );
        if (!needsMigrate) continue;
        const migrated = (parsed as unknown[])
            .map((m) => (typeof m === "string" ? toModel(m) : m))
            .filter((m) => m && typeof m === "object");
        d.prepare("UPDATE providers SET models = ? WHERE id = ?").run(
            JSON.stringify(migrated),
            p.id,
        );
    }
    // Drop the now-unused global active provider/model settings rows.
    d.exec(
        "DELETE FROM settings WHERE key IN ('activeProviderId', 'activeModel')",
    );
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
    return ProviderSchema.parse({
        id: r.id,
        name: r.name,
        apiType: r.api_type,
        baseUrl: r.base_url,
        models: JSON.parse(r.models),
        credential: {
            source: r.credential_source,
            ref: r.credential_ref ?? undefined,
        },
        enabled: r.enabled === 1,
        createdAt: r.created_at,
    });
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
        return r.credential_ref
            ? (Deno.env.get(r.credential_ref) ?? null)
            : null;
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

export function updateProvider(
    id: string,
    input: ProviderInput,
): Provider | null {
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

/** Replace a provider's model list (from an API fetch or manual edit). */
export function setProviderModels(
    id: string,
    models: Model[],
): Provider | null {
    run(
        "UPDATE providers SET models = ? WHERE id = ?",
        JSON.stringify(models),
        id,
    );
    return getProvider(id);
}

// --- Settings ----------------------------------------------------------------

const DEFAULT_SETTINGS: Settings = {
    defaultStream: true,
    activeAssistantId: null,
};

export function getSettings(): Settings {
    const rows = query<{ key: string; value: string }>(
        "SELECT key, value FROM settings",
    );
    const map = new Map(rows.map((r) => [r.key, r.value]));
    return SettingsSchema.parse({
        defaultStream: map.has("defaultStream")
            ? map.get("defaultStream") === "true"
            : DEFAULT_SETTINGS.defaultStream,
        activeAssistantId: map.get("activeAssistantId") || null,
    });
}

export function updateSettings(patch: SettingsPatch): Settings {
    const p = SettingsPatchSchema.parse(patch);
    const upsert = (key: string, value: string) =>
        run(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            key,
            value,
        );
    if (p.defaultStream !== undefined) {
        upsert("defaultStream", p.defaultStream ? "true" : "false");
    }
    if (p.activeAssistantId !== undefined) {
        upsert("activeAssistantId", p.activeAssistantId ?? "");
    }
    return getSettings();
}

// --- Assistants ---------------------------------------------------------------

interface AssistantRow {
    id: string;
    name: string;
    emoji: string;
    description: string;
    prompts: string;
    provider_id: string | null;
    model_id: string | null;
    created_at: number;
    updated_at: number;
}

function rowToAssistant(r: AssistantRow): Assistant {
    return AssistantSchema.parse({
        id: r.id,
        name: r.name,
        emoji: r.emoji,
        description: r.description,
        prompts: JSON.parse(r.prompts),
        providerId: r.provider_id,
        modelId: r.model_id,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
    });
}

function rowToAssistantSummary(r: AssistantRow): AssistantSummary {
    return AssistantSummarySchema.parse({
        id: r.id,
        name: r.name,
        emoji: r.emoji,
        description: r.description,
        providerId: r.provider_id,
        modelId: r.model_id,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
    });
}

export function listAssistants(): AssistantSummary[] {
    return query<AssistantRow>(
        "SELECT * FROM assistants ORDER BY created_at ASC",
    )
        .map(rowToAssistantSummary);
}

export function getAssistant(id: string): Assistant | null {
    const r = queryOne<AssistantRow>(
        "SELECT * FROM assistants WHERE id = ?",
        id,
    );
    return r ? rowToAssistant(r) : null;
}

export function createAssistant(input: AssistantInput): Assistant {
    const id = uid("asst");
    const now = Date.now();
    run(
        `INSERT INTO assistants (id, name, emoji, description, prompts, provider_id, model_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        input.name,
        input.emoji,
        input.description,
        JSON.stringify(input.prompts),
        input.providerId,
        input.modelId,
        now,
        now,
    );
    return getAssistant(id)!;
}

export function updateAssistant(
    id: string,
    input: AssistantInput,
): Assistant | null {
    const now = Date.now();
    const changes = run(
        `UPDATE assistants SET name = ?, emoji = ?, description = ?, prompts = ?, provider_id = ?, model_id = ?, updated_at = ?
         WHERE id = ?`,
        input.name,
        input.emoji,
        input.description,
        JSON.stringify(input.prompts),
        input.providerId,
        input.modelId,
        now,
        id,
    ).changes;
    return changes ? getAssistant(id) : null;
}

export function deleteAssistant(id: string): boolean {
    return run("DELETE FROM assistants WHERE id = ?", id).changes > 0;
}

// --- Conversations + messages ------------------------------------------------

interface ConvRow {
    id: string;
    title: string;
    created_at: number;
    updated_at: number;
    assistant_id: string | null;
    provider_id: string | null;
    model: string | null;
}

function rowToSummary(r: ConvRow, messageCount: number): ConversationSummary {
    return ConversationSummarySchema.parse({
        id: r.id,
        title: r.title,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        assistantId: r.assistant_id,
        providerId: r.provider_id,
        model: r.model,
        messageCount,
    });
}

export function listConversations(assistantId?: string): ConversationSummary[] {
    const rows = assistantId
        ? query<ConvRow>(
            "SELECT * FROM conversations WHERE assistant_id = ? ORDER BY updated_at DESC",
            assistantId,
        )
        : query<ConvRow>(
            "SELECT * FROM conversations ORDER BY updated_at DESC",
        );
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
    return ChatMessageSchema.parse({
        id: r.id,
        role: r.role,
        text: r.text,
        reasoning: r.reasoning ?? undefined,
        toolCalls: r.tool_calls ? JSON.parse(r.tool_calls) : undefined,
        model: r.model ?? undefined,
        usage: r.usage ? JSON.parse(r.usage) : undefined,
        durationMs: r.duration_ms ?? undefined,
        createdAt: r.created_at,
    });
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
        messages: msgs.map(rowToMessage),
        hasMore: false,
        oldestSeq: null,
    };
}

const PAGE_SIZE = 30;

/** Conversation meta + the recent message tail (NOT all messages). Used by the
 *  REST endpoint so opening a long conversation doesn't transfer everything. */
export function getConversationPage(
    id: string,
    limit = PAGE_SIZE,
): Conversation | null {
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

/** Default title given to a new conversation; runChat auto-titles when this is still set. */
export const NEW_CHAT_TITLE = "New chat";

export function createConversation(input: ConversationCreate): Conversation {
    const id = uid("conv");
    const now = Date.now();
    run(
        `INSERT INTO conversations (id, title, created_at, updated_at, assistant_id, provider_id, model)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        id,
        input.title?.trim() || NEW_CHAT_TITLE,
        now,
        now,
        input.assistantId ?? null,
        input.providerId ?? null,
        input.model ?? null,
    );
    return getConversation(id)!;
}

export function updateConversationTitle(id: string, title: string): void {
    run(
        "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?",
        title,
        Date.now(),
        id,
    );
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
    // nextSeq + INSERT must be atomic so concurrent sends to the same
    // conversation can't pick the same seq (defense-in-depth with UNIQUE above).
    const d = getDb();
    d.exec("BEGIN IMMEDIATE");
    try {
        const seq = nextSeq(conversationId);
        d.prepare(
            `INSERT INTO messages
             (id, conversation_id, seq, role, text, reasoning, tool_calls, model, usage, duration_ms, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
            msg.id,
            conversationId,
            seq,
            msg.role,
            msg.text,
            msg.reasoning ?? null,
            msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
            msg.model ?? null,
            msg.usage ? JSON.stringify(msg.usage) : null,
            msg.durationMs ?? null,
            msg.createdAt,
        );
        d.exec("COMMIT");
    } catch (e) {
        d.exec("ROLLBACK");
        throw e;
    }
    touchConversation(conversationId);
}

// --- Bootstrap ---------------------------------------------------------------

/** On an empty provider table, seed one from env (if present) or a faux dev
 *  provider, so the app is usable on first run. Returns the created provider's
 *  id + first model, or null if a provider already existed. */
export function ensureBootstrapProvider(): {
    providerId: string;
    modelId: string;
} | null {
    const count = queryOne<{ n: number }>(
        "SELECT COUNT(*) AS n FROM providers",
    )!;
    if (count.n > 0) return null;
    const baseUrl = Deno.env.get("OPENAI_BASE_URL");
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    const created = (baseUrl && apiKey)
        ? createProvider({
            name: "OpenAI (from env)",
            apiType: "openai-completions",
            baseUrl,
            models: [toModel(Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini")],
            credential: { source: "env", ref: "OPENAI_API_KEY" },
            enabled: true,
        })
        : createProvider({
            name: "Faux (dev, no key)",
            apiType: "faux",
            baseUrl: "http://localhost:0",
            models: [toModel("faux-1")],
            credential: { source: "inline" },
            enabled: true,
        });
    return { providerId: created.id, modelId: created.models[0]?.id ?? "" };
}

/** Seed a default assistant on first run and make it active. Also adopts any
 *  conversations from a pre-assistant DB (assistant_id IS NULL) into it, and
 *  binds the bootstrap provider+model so chat works zero-config. */
export function ensureBootstrapAssistant(
    bootstrap?: { providerId: string; modelId: string } | null,
): void {
    const count = queryOne<{ n: number }>(
        "SELECT COUNT(*) AS n FROM assistants",
    )!;
    let defaultId: string;
    if (count.n > 0) {
        defaultId = queryOne<{ id: string }>(
            "SELECT id FROM assistants ORDER BY created_at ASC LIMIT 1",
        )!
            .id;
    } else {
        const created = createAssistant({
            name: "Default",
            emoji: "✨",
            description: "The default assistant.",
            prompts: [
                {
                    id: uid("blk"),
                    role: "system",
                    name: "Main",
                    content: "You are a helpful assistant.",
                    enabled: true,
                },
                {
                    id: uid("blk"),
                    role: "history",
                    name: "History",
                    content: "",
                    enabled: true,
                },
            ],
            providerId: bootstrap?.providerId ?? null,
            modelId: bootstrap?.modelId ?? null,
        });
        defaultId = created.id;
    }
    if (getSettings().activeAssistantId === null) {
        updateSettings({ activeAssistantId: defaultId });
    }
    // Adopt orphaned conversations (pre-assistant DBs) into the default assistant.
    run(
        "UPDATE conversations SET assistant_id = ? WHERE assistant_id IS NULL",
        defaultId,
    );
}
