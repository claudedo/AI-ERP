# NODUS

## Percorso cliente, anagrafiche e Smart Entry

### Una sola chat NODUS AI

L'inserimento di proprietà/immobili è instradato verso il modulo immobiliare anche in fallback locale e dalla pagina Aziende. “Aggiungi una nuova proprietà da 450 mila euro” estrae `450000` nel prezzo e chiede riferimento o indirizzo senza inventare proprietari. Nessuna proposta può sostituire l'immobile con un'azienda. Le vecchie bozze errate non confermate vengono riaperte come testo modificabile, conservando la conversazione e senza toccare record già salvati. Test browser dedicato: `node scripts/realestate-entry-qa.mjs`, con Chrome QA isolato su porta `9228` e Vite su `5177`; l'opzione `production` ripete il test sul sito pubblico usando soltanto localStorage del profilo di test.

Sidebar, toolbar, dashboard, moduli e command palette aprono la stessa conversazione **NODUS AI**, senza selettore Operator/Builder e senza finestra di inserimento separata. Domande, richieste di inserimento e modifiche strutturali supportate sono instradate automaticamente. Le proposte dati sono modificabili nella chat, restano in attesa di conferma e lasciano aperta la conversazione dopo il salvataggio. È possibile integrare i dettagli mancanti con un messaggio successivo. Le modifiche passano sempre per le validazioni e i permessi esistenti; nella modalità connessa i dati vengono salvati solo tramite il dispatcher server. Le proposte strutturali della chat richiedono un Admin e conferma esplicita; il Visual Builder resta disponibile.

La cronologia unica e la preview dati sono conservate in `nodus-ai-<workspaceId>`; le precedenti conversazioni Operator/Builder e la bozza Smart Entry vengono recuperate senza cancellare le chiavi originali. La Function dedicata usa OpenAI Responses sul server e un contesto minimo selezionato; in caso di indisponibilità torna al motore locale nella stessa UI. Nessuna chiave nel browser, nei log o nel repository. Configurazione, sicurezza, limiti e verifica deploy: [NODUS AI](docs/NODUS-AI.md).

Test della chat: `npm test` e `node scripts/unified-chat-qa.mjs`. Il secondo richiede Vite su `127.0.0.1:5177` e Chrome di test con debugging su `127.0.0.1:9227`, **con profilo temporaneo dedicato**: reinizializza il localStorage di quel profilo e non va eseguito su un browser contenente dati personali. Verifica conversazione unica, conferma, persistenza, chiarimenti, doppio invio e mobile.

La landing identifica la demo locale e il motore a regole prima dell’avvio. L’onboarding riconosce consulenza, moda, immobiliare e arredamento anche in italiano; per descrizioni ambigue richiede un settore esplicito. Descrizione, architettura, raccomandazioni e fase sono conservate in `nodus-onboarding-v1`; “Ricomincia e cancella bozza” avvia una nuova bozza. Formati incompatibili vengono ignorati senza cancellare il workspace. I passaggi di caricamento interrotti ripartono da un passaggio modificabile.

La migrazione dati 4 → 5 riunisce Clienti/Customers/Fornitori nell’unica base **Aziende**, con viste Clienti e Fornitori (tipo **Entrambi** visibile in entrambe). Conserva gli ID quando possibile, rimappa relazioni, commenti e allegati e mantiene i dati originali in `legacyDetails`; il JSON precedente è salvato come backup prima della migrazione locale. Aziende con stesso nome normalizzato o stessa partita IVA vengono consolidate, conservando anche i valori originali. Una bozza strutturale precedente è conservata in `companyMigrationDraft` per recupero manuale, senza applicarla a uno schema ormai diverso. La cronologia configurazioni rimane disponibile; un ripristino incompatibile viene bloccato.

Ogni azienda contiene ragione sociale, nome commerciale, tipo, partita IVA, codice fiscale, paese, settore, sito, note e stato. **Sedi** e **Contatti** sono moduli relazionali della stessa persistenza: più elementi per azienda, sede associata al contatto verificata, una sola sede/contatto principale per azienda. La scheda propone Panoramica, Contatti, Sedi, Operazioni, Documenti e Attività; le operazioni provengono dai collegamenti realmente presenti. La partita IVA è facoltativa (aziende estere e privati supportati), normalizzata e controllata per duplicati. Il controllo non certifica iscrizioni fiscali o validità presso registri esterni.

L'inserimento assistito è parte della chat **NODUS AI**. Lo stesso servizio `smartEntry.ts` legge lo schema corrente e prepara una preview modificabile. Supporta aziende con contatto e sede espliciti, ordini con quantità/prezzi, aggiornamento indirizzo e data consegna, attività/progetti e campi espliciti `Nome campo: valore`. Le date relative diventano date assolute visibili. Riferimenti ambigui richiedono selezione o chiarimento; schemi insufficienti richiedono una proposta strutturale. I valori non presenti non sono inventati. La proposta viene salvata con un unico aggiornamento della persistenza, usando validazione/permessi/relazioni e origine `ai`; idempotenza della proposta, controllo revisione, controllo duplicati e transazione impediscono conferme ripetute e salvataggi parziali. In modalità connessa il dispatcher valida lo stesso comando e accoda gli eventi nella transazione SQL.

La bozza Smart Entry (testo e preview) è conservata nel browser per workspace. Rigenerare una proposta dopo altre modifiche aggiorna il contesto; una proposta obsoleta non è applicata. L’interprete locale è deterministico e limitato: non comprende liberamente ogni email, non consulta siti, non invia messaggi e non rappresenta un LLM. Se una richiesta non è supportata, la segnala e permette correzione o passaggio al Builder. Non aggiunge automaticamente moduli business mancanti; i campi quantità/prezzo/descrizione degli ordini sono predisposti nella migrazione per rendere rappresentabili gli esempi supportati.

OpenAI è integrato tramite `netlify/functions/nodus-ai.ts` e `OPENAI_API_KEY` server-side. `OPENAI_MODEL` è facoltativo. `AI_PROVIDER_URL` rimane l'adapter opzionale precedente per il Visual Builder, distinto dalla chat unica. Il backend organizzazione richiede il setup in `docs/BACKEND.md`; i test locali non certificano credenziali e servizi live.

Configurable business workspaces with a visual Builder, an operational Workspace and controlled AI proposals. Bordeaux/cream, the original logo and uppercase Didot wordmark are preserved; functional UI uses the existing sans-serif stack and design tokens.

## Run and verify

Node 22.12 or newer:

```sh
npm install
npm run dev
npm test
npm run build
```

The build type-checks browser code and Netlify Functions. `npm run dev` serves the independent local demo. Use Netlify Dev for local Functions.

## Working locally

- Sector onboarding, CSV/XLSX mapping/import, duplicate skipping, rejected-row reports, filtered/selected CSV export.
- Record drawers, validation, confirmed deletion/link cleanup, assignments, comments/mentions and IndexedDB attachments (10 MB each).
- Table/List/Kanban/Calendar, combined filters, sorting, columns, saved views, configurable dashboard widgets and command palette.
- Visual Builder: create/rename/reorder/archive modules; configure typed fields, defaults, required rules, sidebar groups, form order/columns, table visibility, create/export buttons, views, workflows and role options.
- Preview and Workspace reuse `EntityTable`/`RecordDrawer`; preview record editing is disabled. Configuration is declarative, not generated React code.
- Draft changes are saved separately. Publication validates configuration and current records atomically. Up to 20 previous configurations can be loaded as drafts; incompatible restoration/type changes are rejected. Archiving preserves records and references.
- Generic structured AI proposal example: `Crea un modulo Campionari con codice, collezione, stagione, stato e collegamento al fornitore`. The local parser supports module creation with named fields; other changes use the manual Builder. Ambiguous targets block application. Older quick-command AI flows remain for compatibility.
- Safe arithmetic formulas (`[quantity] * [price]`), dependency/cycle validation, conditional field visibility and required rules. No eval or JavaScript execution.
- Browser workflows execute on record writes, including import. They do not run when the app is closed or send email. Structural publication/AI configuration changes do not replay record events; subsequent record writes do.

## Persistence and migrations

### Reliability and performance hardening

- Required and conditionally required relations block parent deletion; optional links are cleared as before.
- Import previews use domain validation, reject ambiguous linked names and reserved IDs, and import batches atomically with one aggregate clone. CSV export preserves visible column order and neutralizes formula-like text cells.
- Persisted workspaces are structurally validated after migration. Stale local snapshots are rejected before writing and cross-tab storage changes are surfaced without overwriting an open draft. This is optimistic detection, not an atomic multi-process database; simultaneous browser writes are still a local-demo limitation.
- Main screens load lazily; tables render 50 rows per page, with deferred search and indexed relation labels. Search and CSV export continue to include the entire filtered result, not only the current page.
- Connected projection writes are incremental and transactional membership reads reuse the transaction connection. Structural proposal confirmation is one atomic server action.
- `npm test` covers regression cases; `node scripts/browser-smoke.mjs` runs isolated Chrome against `dist` (build first; set `CHROME_BIN` when needed). GitHub Actions runs tests, build, browser smoke and unused-code checks on push/PR. Hosted database, Storage and quota integration still require the live checklist in `docs/BACKEND.md`.

The original `ai-business-os-workspace` key is retained. Schema migrations 1 → 2 → 3 → 4 → 5 save the previous JSON under a timestamped backup key before migration. Version 4 adds draft/version metadata; version 5 unifies company registries and their relations as described above. Corrupt data and quota failures are surfaced without silent reset. File blobs are in IndexedDB; JSON contains metadata only.

IDs survive renaming. Populated fields cannot be destructively removed or changed to incompatible types through publication: create a replacement field and explicitly migrate data. Supported relationships are many-to-one and unique one-to-one. For many-to-many, use a link module with two relation fields. Local data is single-browser, not a shared organizational backup.

## Connected mode

“Connected workspace” opens a separate authenticated mode with an asynchronous API repository, the same Builder/record renderer, shared records/comments/approvals, invitations, private signed attachments and background event status. Server authentication uses Supabase; tenant and role come from a verified identity and database membership. Mutations validate actions, lock the workspace, check expected revision and persist idempotency receipts/audit entries.

PostgreSQL includes organizations, memberships, configuration versions, dynamic entities/JSONB records, relations, comments, attachment metadata, workflows, approvals, queued events and audit logs. A Netlify scheduled worker processes events with locking, bounded retries and superseded-event handling. Workflow outputs do not recursively enqueue more events.

See [backend setup and API contract](docs/BACKEND.md). Live database, auth, email, remote storage, scheduled execution and external AI require configuration; they are not verified without credentials. No paid infrastructure is provisioned by this code.

Connected-mode limits: one aggregate workspace per organization, 5,000 records, explicit Refresh rather than realtime subscriptions, individual record writes (bulk import remains local), no outbound webhooks. Demo user switching is local-only.

## Code map

- `src/builder` — visual editing, shared preview, publication and version controls.
- `src/services/configuration.ts` — runtime schemas, atomic operations and publication validation.
- `src/services/workspaceActions.ts` — shared authorized command dispatcher.
- `src/services/workspaceDomain.ts` — record validation, permissions, workflow effects and approvals.
- `src/services/formulas.ts` — safe arithmetic and dependency evaluation.
- `src/ai` — local/server structured-proposal providers.
- `src/persistence/apiRepository.ts` — asynchronous connected repository.
- `src/services/workspaceStorage.ts` — local repository and migration backups.
- `server`, `netlify/functions` — tenant context, SQL migration, API and worker.

## Verification and deployment

Tests cover import, migration backups, relation integrity, permissions, structural atomicity, stale proposals, publication/restoration, formulas, workflow duplicate prevention and server membership boundaries. Unit membership tests do not replace live PostgreSQL/RLS integration tests: follow the checklist in `docs/BACKEND.md` before using real business data.

Netlify builds with `npm run build`, serves `dist` and bundles `netlify/functions`. Check the deploy for the exact Git commit; a successful push alone does not confirm deployment.
