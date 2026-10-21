# Regola permanente del progetto

Per ogni aggiornamento richiesto dall’utente: implementa le modifiche, esegui `npm run build`, correggi gli errori bloccanti, crea un commit Git descrittivo e fai push su `main`. Netlify è collegato al repository e deve pubblicare automaticamente ogni push su `main`. Nel report finale indica sempre l’hash del commit inviato. Non dichiarare il deploy Netlify riuscito senza verificarne lo stato.

## Eccezione: lavori lunghi su branch dedicato

I lavori lunghi (restyling, design, refactoring) si fanno su un branch dedicato, non su `main`:

- Crea un branch dedicato al lavoro (ad esempio `design/restyling`).
- Per ogni blocco: implementa, esegui `npm run build`, correggi gli errori bloccanti, crea un commit descrittivo **sul branch** e fai push **del branch** su GitHub. Nel report indica l’hash del commit e il nome del branch.
- **Non** unire il branch a `main` e **non** pubblicare in produzione finché l’utente non lo chiede esplicitamente.
- Motivo: ogni pubblicazione di produzione su Netlify consuma crediti del piano; le anteprime dei branch no.
