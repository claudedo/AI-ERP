# NODUS AI — integrazione OpenAI

Unica chat in italiano, con le stesse palette, icone e componenti del prodotto. Il frontend chiama solo `/.netlify/functions/nodus-ai`; esclusivamente la Function usa `process.env.OPENAI_API_KEY`. Nessun SDK o nuova dipendenza. Nessun tool, ricerca web o servizio esterno viene abilitato nel modello.

## Configurazione Netlify

- `OPENAI_API_KEY`: segreto esistente, scope **Functions**, disponibile nel contesto **Production**. Non leggerne il valore dal client, non committarlo e non copiarlo nei log. La configurazione locale non è necessaria per il deploy.
- `OPENAI_MODEL`: facoltativo, default `gpt-4.1-mini`. L'ID e la compatibilità con Responses/Structured Outputs sono verificati nella [documentazione ufficiale OpenAI](https://developers.openai.com/api/docs/models/gpt-4.1-mini). La disponibilità sull'account e la quota si verificano solo con una chiamata riuscita in produzione; il codice non presume che siano presenti.
- La modalità organizzazione autenticata continua a richiedere il setup Supabase/Postgres descritto in `BACKEND.md`.

La Function non modifica dati. Il modello restituisce un envelope JSON rigoroso, validato con Zod, convertito nelle tipologie `answer`, `query_results`, `entry_proposal`, `update_proposal`, `structure_proposal`, `clarification`, `unsupported`. Le proposte dati attraversano `entrySchema`, permessi, controllo revisione e `applyEntry`; la preview è modificabile e il salvataggio è possibile solo tramite **Conferma**. Le proposte strutturali richiedono una richiesta esplicita di un Admin: Conferma passa da stage/publish e dalle validazioni esistenti.

## Contesto minimo e consultazioni

Invio limitato a messaggio (6000 caratteri), massimo 6 turni abbreviati (12000 caratteri complessivi), schema, ruolo/permessi e massimo 40 record selezionati (massimo 12 per entità). Aziende, contatti, sedi, documenti, immobili e altri moduli vengono individuati nello schema, senza aggiungerli automaticamente. Il selettore privilegia i riferimenti presenti nella richiesta e un livello di relazioni. Password, token, IBAN e dettagli legacy sono esclusi; email/telefoni/dati fiscali non necessari sono omessi. Il contesto è limitato a 60000 caratteri; i record sono dichiarati parziali al modello. Nessun database completo è inviato indiscriminatamente. `store: false` disabilita lo storage applicativo Responses; non equivale a una garanzia di zero retention del provider.

In demo il contesto appartiene al browser e non è una fonte di autorizzazione server per scritture. In modalità connessa la Function ignora contesto e permessi client, verifica JWT/membership e ricostruisce il contesto dal workspace dell'organizzazione. I salvataggi continuano sul dispatcher transazionale autenticato, non sull'output del modello.

Per consultazioni il modello prepara filtri e metriche tipizzati. Il gestionale esegue la query su tutti i record autorizzati effettivamente disponibili nel workspace: conteggi, somme, raggruppamenti e record cliccabili sono calcolati, non copiati da una risposta inventata. Supportati filtri AND e collegamenti a un livello con `campoRelazione.campoDestinazione`. Somme di campi currency sono presentate in EUR come il resto dell'app; non è un motore contabile multi-valuta.

## Fallback e protezioni

Timeout del provider: `OPENAI_TIMEOUT_MS`, default **8000 ms**, configurabile da 1000 a 15000 ms; valori invalidi tornano al default. Il client attende al massimo 18 secondi. Il budget di output è 1500 token per richieste ordinarie, 3000 per struttura; lo schema JSON strutturale entra nelle instructions soltanto per `chatIntent(message) === "structure"`. L’envelope strict rimane sempre attivo. Le [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) possono essere incomplete per limite di token: non si applicano risposte parziali e si usa il fallback con rimborso della prenotazione.

La [documentazione Netlify attuale](https://docs.netlify.com/build/functions/configuration/) indica 60 secondi come limite sincrono predefinito e 30 per le Functions pianificate. Il piano e le eventuali condizioni legacy del sito non sono stati verificati tramite account Netlify: controllare il limite effettivo nella dashboard. Non è stato richiesto né presunto un aumento di piano. Il default prudente di 8 secondi non sostituisce il monitoraggio dei tempi di database e rimborso.

Se mancano chiave/quota, il provider fallisce, rifiuta, scade o restituisce JSON non valido, la chat usa il motore locale mantenendo la stessa UI e segnala **Modalità locale temporanea**. **NODUS AI connesso** appare solo dopo una risposta OpenAI valida. Il fallback è limitato e non viene presentato come comprensione generativa completa.

Limiti input/output, body massimo 160 KB, timeout, rifiuto cross-origin, nessun CORS permissivo e blocco doppio invio nel client. La configurazione esportata dalla Function aggiunge un [rate limit Netlify](https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/) di 10 richieste/minuto per IP e dominio, prima dell'invocazione; il contatore in memoria rimane una seconda difesa, non una quota distribuita.

Con `DATABASE_URL` configurato, applicare `server/migrations/002_ai_usage.sql`: le prenotazioni delle chiamate al modello sono transazionali e condivise tra istanze, con limite giornaliero globale (`NODUS_AI_DAILY_LIMIT`, default 500) e per client (`NODUS_AI_CLIENT_DAILY_LIMIT`, default 50). Vengono memorizzati soltanto hash degli identificativi client, non IP in chiaro. Limite esaurito, database indisponibile o migrazione mancante attivano il motore locale senza spendere una chiamata al provider. Le prenotazioni fallite non consumano parzialmente il budget.

Le chiamate a pagamento sono **bloccate per default senza quota condivisa**: database assente, migrazione mancante, errore o quota esaurita mantengono la chat in modalità locale. `NODUS_AI_REQUIRE_QUOTA` non abilita più alcuna eccezione. Soltanto nello sviluppo locale è possibile impostare `NODUS_AI_ALLOW_UNMETERED=true`; il bypass è rifiutato negli ambienti di produzione e deploy Netlify. Errori HTTP, timeout e risposte non valide rimborsano la prenotazione sui due contatori, una sola volta e sulla data originaria. Questo rimborso è applicativo: non annulla eventuali costi già addebitati dal provider per una richiesta fallita. La migrazione e le variabili Netlify non vengono applicate dal codice né dal semplice push. Questi sono limiti di chiamate, non un tetto monetario: configurare anche i budget del provider. L'origine HTTP non sostituisce autenticazione e può essere falsificata fuori da un browser. Non usare questa demo anonima come confine multi-tenant.

## Prova pagamento Modena

### Migrazione delle etichette immobiliari

`realEstateLabels.ts` cambia soltanto i `name` predefiniti richiesti: Properties → Immobili, Owners → Proprietari, Leads → Potenziali clienti, Reference → Riferimento, Address → Indirizzo, Asking price → Prezzo richiesto. ID, dati dei record, opzioni di stato, versione, chiave localStorage e nomi personalizzati restano invariati. Si applica ai workspace generati e, al caricamento, a quelli esistenti, comprese bozze e configurazioni storiche per evitare che una pubblicazione ripristini l’inglese. Prima di riscrivere un workspace locale viene conservato il JSON originale come backup. In modalità connessa la localizzazione è applicata in lettura e viene persistita nella successiva modifica autorizzata. Non richiede una nuova migrazione SQL.

Il controllo deterministico riconosce €300.000, Modena e pagamento ricevuto, cerca riferimenti compatibili nello schema e non inventa date o collegamenti. Una sola corrispondenza produce una proposta; più immobili chiedono una scelta tramite ID; nessun riferimento o modulo Pagamenti assente richiede chiarimenti. Non crea un nuovo modulo autonomamente. I dati demo originari non sono stati cambiati: il fixture di test aggiunge immobili/pagamenti soltanto nei test. Nessuna scrittura avviene prima della conferma.

## Verifica reale

- `npm test`, `npm run build`, `node scripts/unified-chat-qa.mjs` (Chrome isolato; reinizializza solo quel localStorage).
- `GET /.netlify/functions/nodus-ai`: stato pubblico di configurazione, **mai** valore della chiave. `configured: true` non certifica che account/quota/model siano utilizzabili.
- `GET /build-info.json`: commit della build effettivamente pubblicata. Verificare che coincida con il commit pushato, poi provare POST con dati sintetici e controllare `source: openai`.
- Il push non certifica il deploy. Solo la verifica della build pubblicata e della Function consente di dichiararlo riuscito; il test sintetico non certifica tutti i flussi di un'organizzazione autenticata.
