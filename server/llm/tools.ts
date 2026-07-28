// Sample tools available to the agent. The backend owns tool execution (tools
// run server-side, never in the browser). Add real tools here as needed.

import { Type } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";

const weatherParams = Type.Object({
    city: Type.String({ description: "The city to get weather for, e.g. 'Tokyo'" }),
});

/** Mocked weather tool - demonstrates the tool-call loop end to end. */
const getWeather: AgentTool<typeof weatherParams> = {
    name: "get_weather",
    label: "Weather",
    description: "Get the current weather for a given city. Use when the user asks about weather.",
    parameters: weatherParams,
    execute: (_toolCallId, { city }) => {
        const mock: Record<string, string> = {
            tokyo: "sunny, 22C",
            london: "rainy, 14C",
            "new york": "cloudy, 18C",
        };
        const result = mock[city.toLowerCase()] ?? `no data for ${city}`;
        return Promise.resolve({
            content: [{ type: "text" as const, text: result }],
            details: { city },
        });
    },
};

export const sampleTools = [getWeather];
