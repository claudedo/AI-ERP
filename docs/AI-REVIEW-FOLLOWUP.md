# NODUS — correzioni dell’audit della chat AI

Intervento sulla chat esistente, non una ricostruzione. Nessuna nuova dipendenza.
Palette, logo, wordmark e token CSS non modificati. Nessuna scrittura automatica: preview e conferma esplicita restano obbligatorie.

## 1. Costi bloccati per default

File: `server/chatQuota.ts`, `netlify/functions/nodus-ai.ts`, `.env.example`, `docs/NODUS-AI.md`.

Senza quota condivisa le richieste usano il motore locale. Il vecchio flag `NODUS_AI_REQUIRE_QUOTA=false` non abilita chiamate a pagamento. `NODUS_AI_ALLOW_UNMETERED=true` richiede anche uno sviluppo locale esplicito (`NODE_ENV=development` o `NETLIFY_DEV=true`) e non è accettato negli ambienti Netlify di deploy o in produzione. L’assenza dei marcatori runtime non è considerata sviluppo locale.

Le prenotazioni riuscite conservano la data del database e dispongono di rimborso idempotente dei due contatori. Il rimborso applicativo non annulla eventuali addebiti già eseguiti dal provider. In caso di indisponibilità del DB durante il rimborso, l’errore è registrato senza dati sensibili; non viene dichiarato un rimborso riuscito.

Test: `server/chatQuota.test.ts`, `server/nodusFunction.test.ts`, `server/quotaRefund.test.ts`. Riprodotti prima della correzione: POST anonima senza DB raggiunge il fetch provider; bypass in assenza di marcatori runtime. Verificati blocco, opt-in locale, limiti, data del rimborso, idempotenza e fallback/rimborso su timeout, HTTP e JSON invalido. GET espone solo booleani di configurazione.

Commit principale: `29bb081`; rafforzamento dei marcatori runtime e diagnostica nel commit finale dell’intervento.

## 2. Preview strutturale dettagliata

File: `src/components/AssistantPanel.tsx`, `src/components/StructureOperations.tsx`, `src/services/structureReview.ts`.

Operazioni, moduli, campi, tipi, opzioni e relazioni visibili in italiano. Sono escludibili operazioni intere e campi di un modulo nuovo. La selezione è conservata nella conversazione. Conferma disabilitata senza operazioni valide o con ambiguità; `proposalSchema` e `stageProposal` vengono rivalidati sulla selezione e sul workspace correnti prima dell’applicazione.

Test: `src/services/structureReview.test.ts`, inclusi schema a tre campi, esclusione di Esito, proposte vuote, ambigue e obsolete. Prova UI in Chrome isolato: tre campi visibili, nessuna scrittura durante la preview, pubblicazione dei soli Nome e Data dopo esclusione di Esito e click su Conferma.

Commit: `54f2f2d`.

## 3. Domande sui pagamenti

File: `src/ai/paymentGuard.ts`, `src/ai/localChat.ts`, `src/services/nodusChat.ts`, `server/openaiChat.ts`, `netlify/functions/nodus-ai.ts`.

Le domande non attivano il guard di inserimento, anche per Viewer. Richieste imperative e il caso dichiarativo esplicito «nuovo pagamento» conservano l’estrazione deterministica. Il guard viene valutato prima di quota e modello; una risposta deterministica è dichiarata locale.

Test: nuovi casi in `server/openaiChat.test.ts` per le due domande richieste, Viewer e assenza di chiamate al provider; preservato il caso Modena da 300.000 euro.

Commit: `b5761ef`.

## 4. Nuovi tentativi ed errori espliciti

File: `server/chatRateLimit.ts`, `netlify/functions/nodus-ai.ts`, `src/ai/chatContract.ts`, `src/ai/chatClient.ts`, `src/components/AssistantPanel.tsx`.

Deduplica soltanto per requestId. Una richiesta nuova con lo stesso testo è ammessa entro i limiti di frequenza. 403 e 429 hanno reason esplicito; il client gestisce anche risposte HTML di blocco Netlify, mostra messaggi italiani e conserva il testo per Riprova, senza fallback silenzioso.

Test: `server/nodusFunction.test.ts`, `server/openaiChat.test.ts`: stesso contesto/testo con UUID diversi, reason forbidden, errori HTTP 403/429 visibili.

Commit: `a944f4f`.

## 5. Fallback locale utile

File: `src/ai/localChat.ts`, `src/ai/localQueries.ts`, `src/services/smartEntry.ts`.

Conteggi/elenchi per modulo e opzioni di stato dello schema, filtri del mese corrente quando è disponibile un campo data univoco, esecuzione tramite `executeChatQuery`. Stati non riconosciuti o ambigui chiedono chiarimenti. Estrazione di indirizzo, città e prezzo per la frase immobiliare richiesta. Tre esempi nel messaggio unsupported, basati sui moduli disponibili.

Test: `src/ai/localChat.test.ts`: entrambe le frasi di accettazione, stato incompatibile e tre esempi reali. Il fallback resta deterministico e limitato, non comprensione generativa generale.

Commit: `0cb4999`.

## 6. Modalità connessa

File: `src/services/workspaceDomain.ts`, `netlify/functions/api.ts`, `netlify/functions/workflow-worker.ts`, `server/workflowExecution.ts`, `src/persistence/apiRepository.ts`, `src/pages/ConnectedWorkspace.tsx`.

Accodamento solo con workflow attivi applicabili. Nessuna persistenza dell’aggregato o incremento revisione in assenza di effetti business. Gli eventi vengono comunque completati e tracciati. Su 409 il client ricarica, non ritenta automaticamente e conserva la bozza.

Test: `server/workflowWorker.test.ts` e `src/persistence/apiRepository.test.ts`: evento senza workflow, workflow inattivo/non applicabile, azione a valore invariato e recupero 409 senza mutare la bozza. I test usano mock: non attestano il funzionamento del database o dell’organizzazione ospitati.

Commit: `38bad11`.

## 7. Timeout e budget di output

File: `server/openaiChat.ts`, `src/ai/chatClient.ts`, `.env.example`, `docs/NODUS-AI.md`.

Provider: default 8 s, `OPENAI_TIMEOUT_MS` tra 1000 e 15000 ms; client: 18 s. Output massimo: 1500 token per richieste ordinarie, 3000 per struttura. Schema strutturale nelle instructions solo per richieste strutturali. Risposte incomplete/non valide non diventano scritture.

Test: `server/openaiChat.test.ts`: default/override timeout, output ridotto e schema strutturale incluso solo nel percorso appropriato. Limiti Netlify documentati con fonte ufficiale; piano effettivo del sito non ispezionato.

Commit: `75cb3af`.

## 8. Italiano della chat e migrazione separata

File chat: `src/ai/chatLanguage.ts`, `src/ai/localChat.ts`, `src/components/AssistantPanel.tsx`, `src/components/SmartEntry.tsx`, `netlify/functions/api.ts`, `index.html`.

Etichette della preview ricavate da field.name; errori noti tradotti, dettagli backend sconosciuti non esposti; spiegazioni locali italiane, documento lang=it. Test in `server/chatLanguage.test.ts` e `src/services/chatPreviewLabels.test.ts`.

Commit chat: `bce124e`.

File migrazione: `src/services/realEstateLabels.ts`, `src/services/workspaceStorage.ts`, `src/services/aiEngine.ts`, `server/platform.ts`, `docs/NODUS-AI.md`.

Tradotti soltanto i sei name predefiniti richiesti. Conservati ID, record, opzioni, nomi personalizzati, versione e chiave localStorage. Gestite configurazioni correnti, bozze e storico; backup prima della riscrittura locale. Test: `src/services/realEstateLabels.test.ts` (idempotenza, conservazione dati, storico, backup).

Commit migrazione: `7cc80da`.

## Verifiche eseguite e limiti

- `npm test`: 144 test verdi in 20 file.
- `npm run build`: verde, frontend e server.
- `npx tsc -p tsconfig.app.json --noEmit --noUnusedLocals --noUnusedParameters`: verde.
- `node scripts/unified-chat-qa.mjs`: eseguito in profilo Chrome temporaneo isolato, 21 verifiche superate, nessun errore runtime.
- Prova aggiuntiva della preview Controllo qualità: 3 verifiche UI superate.
- Browser smoke sul bundle di produzione: superato, inclusi paginazione, ricerca, filtri, conflitto tra schede, recupero e responsive.

Le prove browser sono locali e senza chiamate a pagamento. Non sono un collaudo live di Supabase, RLS, inviti, Storage, quote PostgreSQL o concorrenza reale tra membri. Gli esiti del deploy e della POST sintetica in produzione vanno confrontati con il commit finale tramite build-info e sono riportati nel report conclusivo della sessione.

## Configurazione manuale

Applicare `server/migrations/002_ai_usage.sql` al backend già inizializzato e configurare DATABASE_URL per rendere disponibili le quote condivise. OPENAI_API_KEY rimane esclusivamente Functions/server. NODUS_AI_DAILY_LIMIT e NODUS_AI_CLIENT_DAILY_LIMIT hanno default 500 e 50; OPENAI_TIMEOUT_MS ha default 8000. Non abilitare ALLOW_UNMETERED in produzione. Nessuna credenziale è richiesta nella chat né inclusa nei test.

Il file NODUS-code-review.zip preesistente non è stato modificato o incluso nei commit.
