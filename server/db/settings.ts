// App-level settings (key/value store): defaultStream + activeAssistantId.

import type { Settings, SettingsPatch } from "../../shared/api.ts";
import { SettingsPatchSchema, SettingsSchema } from "../../shared/api.ts";
import { query, run } from "./client.ts";

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
