# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: the **operational staff** of a small or medium business (PMI) of any sector — people who spend the working day entering, updating and finding records (companies, contacts, sites, orders, properties, deals, payments, tasks). They need speed, legibility and no surprises; most are not technical.

Secondary: the business owner or admin who designs the workspace (modules, fields, roles, automations) through the onboarding and the visual editor, and checks the dashboard.

## Product Purpose

NODUS turns a plain description of how a company works into a configurable management workspace (gestionale): modules, records, relations, views, dashboard, automations, roles, plus one chat (NODUS AI) that answers questions about the data and prepares insert/update proposals that are saved only after explicit confirmation.

Success: staff do their daily data work faster and with fewer errors than in spreadsheets and disconnected tools; the owner can shape the system without a developer.

## Positioning

One workspace shaped around the company's own processes rather than a fixed vertical template, with an AI assistant that never writes on its own: every AI change is a reviewable, editable proposal that passes the same validation and permissions as manual edits.

## Operating Context

- Current stage: **demo to show** to prospective customers or investors; no paying customers yet.
- Local demo mode keeps data in the browser; an optional connected mode (Supabase/Postgres, Netlify Functions) exists but is not verified live.
- Desktop-first daily work (tables, record drawers, dashboard), but every screen must also work at tablet and phone widths.
- UI language: Italian.

## Capabilities and Constraints

- Sector-agnostic: templates exist (fashion, real estate, consulting, furniture, generic) but the interface itself must stay neutral and credible for any SMB, without a sector character.
- AI chat may use OpenAI or Groq server-side; without a configured model it falls back to a limited local rules engine. Never imply AI capabilities that are not active.
- Do not change functions, data, factual copy or logic during visual work; copy changes must be asked for.
- No new dependencies without approval.
- Long tasks (restyling, refactoring) live on a dedicated branch and are not merged or published without explicit approval (see AGENTS.md).

## Brand Commitments

- Name NODUS; existing logo (four-connection node symbol) and uppercase Didot wordmark are kept.
- Colour roles confirmed by the owner: ivory #F6F1E8 for backgrounds (~60%), anthracite #231F20 for text and lines (~30%), bordeaux #651F32 only for interactive elements — buttons, links, selection, focus (~10%). Fixed state colours: green #1F7A50, amber #9A5D10, error red-orange #C2410C. No cold greys, blues, pinks or sand as colours in their own right, and no fourth colour. All colours come from tokens in src/nodus-tokens.css.
- Brand taglines kept in English as identity: "THE INTELLIGENT OPERATING SYSTEM", "STRUCTURE FOR WHAT MOVES YOU".

## Evidence on Hand

None yet: no customers, testimonials, case studies, metrics or press. Do not fabricate any. Real assets: logo SVGs in public/ (nodus-mark.svg, nodus-wordmark.svg, nodus-lockup.svg).

## Product Principles

1. Daily data work first: legibility, speed and consistency outrank visual effect on app screens.
2. Nothing is saved without the user's explicit confirmation; the interface must make that safety visible.
3. Neutral and credible for any SMB: no sector flavour, no hype.
4. Honest about what is simulated or local in the demo.

## Accessibility & Inclusion

Text contrast at least 4.5:1; complete hover, focus, disabled, empty and error states; full keyboard operation.
