/** UI-safe messages: never expose unknown backend exception bodies or SQL details. */
export function chatErrorMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : "";
  if (/SQL|postgres|password|credential|connection string|stack trace/i.test(message)) return "Il servizio non è disponibile. Nessuna modifica applicata: riprova dopo aver aggiornato il workspace.";
  const rules: [RegExp, string][] = [
    [/^(.+) is required\.$/, "$1 è obbligatorio."],
    [/^(.+) must be a valid number\.$/, "$1 deve contenere un numero valido."],
    [/^(.+) must be a valid date\.$/, "$1 deve contenere una data valida."],
    [/^(.+) must link to an existing record\.$/, "$1 deve collegarsi a un record esistente."],
    [/^(.+) must match an available option\.$/, "$1 deve corrispondere a un’opzione disponibile."],
    [/^(.+) is already linked to another record\.$/, "$1 è già collegato a un altro record."],
  ];
  for (const [pattern, replacement] of rules) if (pattern.test(message)) return message.replace(pattern, replacement);
  if (/permission|role.*(?:allow|valid)|access denied/i.test(message)) return "I tuoi permessi non consentono questa operazione. Nessuna modifica applicata.";
  if (/admin/i.test(message)) return "Questa modifica richiede un amministratore.";
  if (/stale|revision|workspace.*changed|later workspace change/i.test(message)) return "Il workspace è cambiato. La bozza è conservata: verifica i dati e rigenera la proposta prima di confermare.";
  if (/save failed|could not be saved|salvataggio/i.test(message)) return "Salvataggio non riuscito. La proposta è conservata: verifica il workspace e riprova.";
  if (/sign in|session expired|organization access/i.test(message)) return "Sessione non valida o accesso non consentito. Accedi di nuovo al workspace.";
  if (/^Choose another name/.test(message)) return "Scegli un altro nome per il campo: l’identificativo è riservato.";
  if (/^Select a unique target module/.test(message)) return "Scegli un modulo di destinazione univoco per la relazione.";
  if (/required|missing|schema|invalid|ZodError/i.test(`${message} ${cause instanceof Error ? cause.name : ""}`)) return "La proposta non è valida. Verifica campi obbligatori, valori e collegamenti prima di confermare.";
  if (/\b(?:non|nessun|nessuna|proposta|richiesta|workspace è|modulo|bozza|indica|verifica|permessi|scegli|specifica|troppe|errore)\b/i.test(message)) return message.slice(0, 1000);
  return "Operazione non riuscita. Nessuna modifica applicata: verifica i dati e riprova.";
}
