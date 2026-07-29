// Assistant persistence: CRUD for personas/presets (prompt blocks + provider/model binding).

import type {
    Assistant,
    AssistantInput,
    AssistantSummary,
} from "../../shared/api.ts";
import { AssistantSchema, AssistantSummarySchema } from "../../shared/api.ts";
import { uid } from "../../shared/id.ts";
import { query, queryOne, run } from "./client.ts";

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
