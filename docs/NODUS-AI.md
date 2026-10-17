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

Se mancano chiave/quota, il provider fallisce, rifiuta, scade o restituisce JSON non valido, la chat usa il motore locale mantenendo la stessa UI e segnala **Modalità locale temporanea**. **NODUS AI connesso** appare solo dopo una risposta OpenAI valida. Il fallback è limitato e non viene presentato come comprensione generativa completa.

Limiti input/output, body massimo 160 KB, timeout, rifiuto cross-origin, nessun CORS permissivo, blocco doppio invio nel client e rate limit di 10 richieste/minuto/IP per istanza calda; richieste con UUID o contenuto ripetuto sono bloccate nella finestra. Il limite in memoria è una protezione base, **non** una quota distribuita né un tetto di spesa. Per una demo pubblica ad alto traffico aggiungere rate limiting edge/WAF e limiti di budget nell'account OpenAI. L'origine HTTP non sostituisce autenticazione e può essere falsificata fuori da un browser. Non usare questa demo anonima come confine multi-tenant.

## Prova pagamento Modena

Il controllo deterministico riconosce €300.000, Modena e pagamento ricevuto, cerca riferimenti compatibili nello schema e non inventa date o collegamenti. Una sola corrispondenza produce una proposta; più immobili chiedono una scelta tramite ID; nessun riferimento o modulo Pagamenti assente richiede chiarimenti. Non crea un nuovo modulo autonomamente. I dati demo originari non sono stati cambiati: il fixture di test aggiunge immobili/pagamenti soltanto nei test. Nessuna scrittura avviene prima della conferma.

## Verifica reale

- `npm test`, `npm run build`, `node scripts/unified-chat-qa.mjs` (Chrome isolato; reinizializza solo quel localStorage).
- `GET /.netlify/functions/nodus-ai`: stato pubblico di configurazione, **mai** valore della chiave. `configured: true` non certifica che account/quota/model siano utilizzabili.
- `GET /build-info.json`: commit della build effettivamente pubblicata. Verificare che coincida con il commit pushato, poi provare POST con dati sintetici e controllare `source: openai`.
- Il push non certifica il deploy. Solo la verifica della build pubblicata e della Function consente di dichiararlo riuscito; il test sintetico non certifica tutti i flussi di un'organizzazione autenticata.
