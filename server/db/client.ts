// SQLite infrastructure: the singleton DatabaseSync, the query/queryOne/run
// helpers (they centralize the node:sqlite row-type cast), and the schema
// migration. All domain modules (providers, settings, assistants, ...)
// import the query helpers from here.

import { DatabaseSync } from "node:sqlite";
import { toModel } from "../../shared/api.ts";

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

export type Bind = string | number | bigint | null | Uint8Array;

export function query<T>(sql: string, ...params: Bind[]): T[] {
    return getDb().prepare(sql).all(...params) as unknown as T[];
}

export function queryOne<T>(sql: string, ...params: Bind[]): T | undefined {
    return getDb().prepare(sql).get(...params) as unknown as T;
}

export function run(sql: string, ...params: Bind[]): { changes: number } {
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
        const needsMigrate = parsed.some((m) => typeof m === "string");
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
