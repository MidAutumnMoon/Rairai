// Provider persistence: CRUD + credential resolution. Secrets are never
// returned in the wire record (resolveProviderKey is the only path to the
// actual secret, called server-side at chat time).

import type { Model, Provider, ProviderInput } from "../../shared/api.ts";
import { ProviderSchema } from "../../shared/api.ts";
import { uid } from "../../shared/id.ts";
import { query, queryOne, run } from "./client.ts";

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
