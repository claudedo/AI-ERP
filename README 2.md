# AI Business OS

A working React prototype for an AI-generated business management platform. A company describes how it works, compares three proposed system architectures, reviews AI suggestions, and enters a configurable workspace with demo data.

## Stack

- React + TypeScript + Vite
- Lucide icons
- Recharts
- Browser `localStorage` for persistence
- Netlify-ready SPA routing

## Structure

- `src/pages` — landing, guided builder, and generated workspace
- `src/services/aiEngine.ts` — deterministic AI simulation and command interpreter
- `src/types` — configurable `Workspace`, `Entity`, `Field`, and `Workflow` model
- `src/data` — realistic demo records
- `src/hooks` — local persistence

## Run locally

```bash
npm install
npm run dev
```

Create a production build with `npm run build` and preview it with `npm run preview`.

## Deploy to Netlify

Connect this directory to Netlify. The included `netlify.toml` uses `npm run build`, publishes `dist`, and redirects all routes to the SPA entry point.

## Connecting a real AI model

Replace the deterministic functions in `src/services/aiEngine.ts` with API requests while keeping their existing typed interfaces: `analyzeBusiness`, `generateArchitectureOptions`, `generateWorkspace`, and `interpretCommand`. In production, model credentials must live in a server-side Netlify Function, never in the browser bundle.

## What is simulated

Business analysis, architecture generation, dashboard metrics, records, workflow suggestions, and AI command interpretation use deterministic local rules and demo data. Workspace changes and added records are functional and persist in the current browser through `localStorage`.
