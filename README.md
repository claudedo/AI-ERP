# NODUS

NODUS is a functional B2B SaaS prototype that connects a company's processes into a configurable, AI-designed management workspace. The demo works without an AI key: its business analysis and workspace changes use a deterministic rules engine designed to be replaceable by real API calls.

## Visual identity

NODUS pairs a custom four-connection node symbol with an uppercase editorial wordmark. Its design tokens live in `src/nodus-tokens.css`: bordeaux, cream, sand and warm-white surfaces, restrained borders and shadows, moderate radii, and accessible interaction states. Didot (with system serif fallbacks) is reserved for the wordmark and editorial headlines; functional UI uses a system sans stack. The original SVG variants live in `public/nodus-mark.svg`, `public/nodus-wordmark.svg` and `public/nodus-lockup.svg`.

## Implemented product flow

1. Business discovery conversation with Fashion, Real Estate, Consulting, and generic examples.
2. Keyword-based process analysis and three architecture proposals.
3. AI suggestions followed by animated workspace generation.
4. A generated, sector-specific operating system with configurable modules, fields, records, relations, saved views, workflows, users, roles, alerts, and AI change history.

## Working capabilities

- Sector-specific modules and demo data for Fashion/production, Real Estate, Consulting, and generic businesses.
- Record search, status filters, configurable column visibility, saved views, add/edit drawer, delete confirmation, and linked relation labels.
- Live dashboard KPIs, alerts, and charts calculated from workspace records.
- AI Operator commands for data queries and filters.
- AI Builder commands for fields, modules, relations, and workflows.
- Structural AI changes always show a preview with scope, data impact, Confirm, and Cancel.
- Automations with active state, triggers, actions, run history, and working demo effects.
- Demo users and Admin, Manager, Operator, and Viewer permissions.
- Local persistence, schema migration for older demo workspaces, reset, responsive layouts, empty states, and success feedback.

## Stack

- React 19 + TypeScript + Vite
- Lucide React icons
- Recharts
- Browser `localStorage`
- Netlify SPA configuration

## Architecture

- `src/types` — domain model for Workspace, Entity, Field, Record, Relation, View, Workflow, User, Role, Alert, and AI history.
- `src/data/templates.ts` — vertical templates and demo records.
- `src/services/aiEngine.ts` — deterministic analysis, command interpretation, change proposals, and confirmed change application.
- `src/services/workspaceStorage.ts` — repository boundary around local persistence and schema migration.
- `src/hooks/useWorkspace.ts` — React persistence integration.
- `src/components` — dashboard, entity table, record drawer, assistant, automations, and access management.
- `src/pages` — landing, discovery/builder flow, and main application shell.

## Run locally

```bash
npm install
npm run dev
```

Create the production bundle with:

```bash
npm run build
```

## Netlify deployment

Connect this folder as the Netlify project. `netlify.toml` is already configured with:

- Build command: `npm run build`
- Publish directory: `dist`
- SPA fallback to `index.html`

## Connecting production services

### AI API

Keep the interfaces exported by `src/services/aiEngine.ts` and replace their deterministic implementations with calls to a server-side endpoint. API credentials must live in a Netlify Function or another backend, never in the Vite browser bundle. The clean integration points are `analyzeBusiness`, `generateArchitectureOptions`, `generateWorkspace`, `interpretCommand`, `createProposal`, and `applyProposal`.

### Backend and database

Implement the `WorkspaceRepository` interface in `src/services/workspaceStorage.ts` with an HTTP-backed repository, then inject it through `useWorkspace`. The UI and domain model do not depend directly on `localStorage`.

## Intentionally simulated

- AI reasoning and natural-language interpretation are rules-based.
- Authentication is represented by switchable demo users, not a real identity provider.
- Workflow execution runs in the browser and covers representative triggers rather than a background job system.
- Demo records are local and single-device; there is no multi-user synchronization or audit-grade backend.
