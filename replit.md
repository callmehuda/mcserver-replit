# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5 + WebSocket (ws)
- **Database**: PostgreSQL + Drizzle ORM (not yet used)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Java**: OpenJDK 21 (for Minecraft server)

## Artifacts

### mc-dashboard (React + Vite)
- **Preview path**: `/`
- **Port**: 19952
- Minecraft server dashboard with real-time log viewer via WebSocket
- Start/Stop server controls, command console, plugin status cards

### api-server (Express 5)
- **Preview path**: `/api`
- **Port**: 8080
- REST + WebSocket endpoints for Minecraft server management
- WebSocket at `/api/ws` streams live server logs to clients

## Minecraft Server

Located at `/home/runner/workspace/minecraft-server/`
- **Server**: PaperMC 1.21.5 (paper-1.21.5.jar)
- **Plugins**:
  - `Geyser-Spigot.jar` — Bedrock Edition support (port 19132)
  - `floodgate-spigot.jar` — Bedrock player auth without Java account
  - `ViaVersion.jar` — Allow newer client versions to connect
  - `ViaBackwards.jar` — Allow older client versions to connect
  - `playit-minecraft-plugin.jar` — Public tunnel via playit.gg
- **Config**: online-mode=false (cracked + Bedrock ok)
- **Java port**: 25565 | **Bedrock port**: 19132

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## API Endpoints

- `GET /api/healthz` — Health check
- `GET /api/minecraft/status` — Server status and info
- `POST /api/minecraft/start` — Start the Minecraft server
- `POST /api/minecraft/stop` — Stop the Minecraft server (sends `stop` command)
- `POST /api/minecraft/command` — Send console command `{ command: string }`
- `GET /api/minecraft/logs` — Get last 500 log lines
- `WS /api/ws` — Live log + status streaming

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
