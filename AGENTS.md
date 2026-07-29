# AGENTS.md

## What This Is

A local-first LLM chat app. Deno backend (Hono), Svelte 5 frontend. Backend owns the agent loop (pi-agent-core/pi-ai) and streams events over SSE; frontend is a thin consumer; zod sits between data boundaries. SQLite for persistence. `shared/` is the contract between both sides.

## Architecture

Three tiers: **shared** → **server** → **frontend**.

- **shared/** is the wire contract. Both sides import from it — never duplicate a type definition across the boundary.
- **server/** is Deno + Hono. It owns the data layer, the agent loop, and translates pi's internal events into the minimal SSE protocol defined in shared.
- **frontend/** is a Svelte 5 SPA. It never imports from server or the pi-* packages. It consumes the REST + SSE APIs and renders state reactively.

Within server, the LLM subsystem (provider resolution, agent runner, tools) is isolated from the HTTP layer.

Within frontend, components are stateless renders; the reactive store + SSE client lives in lib.

## Rules

- The frontend never imports from `server/` or `pi-*` packages. The backend translates pi's internal events into the minimal protocol defined in shared.
- `shared/` is the single source of truth for wire types. Both sides import from it.
- Deno tasks are in `deno.jsonc`. Use `deno task dev` to run both sides; `deno task dev:web` / `deno task dev:server` for one side only.
- 4-space indent, no tabs.

## Fitting New Code

- Read the surrounding code before writing. Extend an existing abstraction over duplicating; if the new feature doesn't fit, reshape the surrounding code to make a place for it rather than force-fitting.
- Reshapes must stay behavior-preserving for other consumers. Call out any behavior change.
- Don't over-refactor: scale the reshape to the feature.
- No bolt-ons: special-case flags, parallel implementations, copy-paste, "refactor later" patches.

## Look Things Up

- When unsure about a library, tool, or API, use web search before guessing.
- Don't hallucinate option names, function signatures, or CLI flags. Look it up.

## Communication

- Be concise. Say the thing, stop.
- Don't repeat what's already in context.
- If something is wrong, say what's wrong and how to fix it. Don't hedge.
