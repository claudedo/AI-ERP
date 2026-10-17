import type { Workspace } from "../types";
import type { ChatResponse } from "./chatContract";
import { paymentGuard } from "./paymentGuard";
import { chatIntent, isChatQuestion } from "../services/nodusChat";
import { proposeEntry } from "../services/smartEntry";
import { currentRole } from "../services/workspaceDomain";
import { localConfigurationProvider } from "./configurationProvider";
import { applyProposal, createProposal, interpretCommand } from "../services/aiEngine";
import { proposalSchema, type ConfigurationOperation } from "../services/configuration";
import { newId } from "../services/workspaceDomain";
import { localExamples, localQuery } from "./localQueries";

export async function localChat(message: string, workspace: Workspace, contextId?: string): Promise<ChatResponse> {
  const payment = paymentGuard(message, workspace); if (payment) return payment;
  const intent = chatIntent(message), role = currentRole(workspace);
  if (intent === "question") { const query = localQuery(message, workspace, contextId); if (query) return query; }
  if (intent === "structure") {
    if (role.id !== "admin" || !role.permissions.editStructure) return { type: "unsupported", source: "local", message: "Solo un Admin può proporre modifiche alla struttura." };
    try { return { type: "structure_proposal", source: "local", message: "Ho preparato una bozza strutturale. Non è ancora applicata.", proposal: await localConfigurationProvider.propose(message, workspace) }; }
    catch {
      // Preserve the existing quick commands, but stage their schema delta instead of writing.
      const legacy = createProposal(interpretCommand(message, "builder"), workspace);
      if (legacy) {
        const next = applyProposal(workspace, legacy), operations: ConfigurationOperation[] = [];
        for (const entity of next.entities) {
          const previous = workspace.entities.find(e => e.id === entity.id);
          if (!previous) operations.push({ type: "createEntity", entity: { id: entity.id, name: entity.name, fields: entity.fields } });
          else for (const field of entity.fields) {
            const old = previous.fields.find(f => f.id === field.id);
            if (!old) operations.push({ type: "addField", entityId: entity.id, field });
            else if (JSON.stringify(old) !== JSON.stringify(field)) operations.push({ type: "updateField", entityId: entity.id, field });
          }
        }
        for (const workflow of next.workflows) if (!workspace.workflows.some(w => w.id === workflow.id)) {
          const orders = workspace.entities.find(e => /order|ordin/i.test(e.name));
          const config = workflow.config || (workflow.id === "high-value-approval" && orders ? { entityId: orders.id, event: "create" as const, action: "request-approval" as const, conditionFieldId: "value", conditionOperator: "greater-than" as const, conditionValue: "20000" } : null);
          if (config) operations.push({ type: "createWorkflow", workflow: { ...workflow, config, runs: [] } });
        }
        for (const view of next.views) if (!workspace.views.some(v => v.id === view.id)) operations.push({ type: "createView", view });
        if (operations.length) return { type: "structure_proposal", source: "local", message: "Ho preparato la proposta strutturale. Nessuna modifica applicata.", proposal: proposalSchema.parse({ id: newId("structure"), request: message, interpretation: "Modifica alla struttura del gestionale", impact: "I dati esistenti saranno conservati. Verifica i campi e le relazioni prima di confermare.", baseRevision: workspace.revision || 0, operations, ambiguities: [] }) };
      }
      return { type: "clarification", source: "local", message: "Specifica nome del modulo e campi, ad esempio: “Crea un modulo Controllo qualità con nome, esito e data”.", questions: ["Quali campi vuoi nel nuovo modulo?"], extracted: [] };
    }
  }
  const proposal = proposeEntry(message, workspace, contextId);
  if (intent === "records" || !isChatQuestion(message) && proposal.operations.length) {
    if (!role.permissions.editRecords) return { type: "unsupported", source: "local", message: "Il tuo ruolo consente solo di consultare i dati." };
    if (!proposal.operations.length) return { type: "clarification", source: "local", message: "Servono altri dettagli per preparare una proposta senza inventare dati.", questions: proposal.questions.length ? proposal.questions : ["Quale record e quali valori vuoi utilizzare?"], extracted: [] };
    return { type: proposal.operations.some(op => op.kind === "update") ? "update_proposal" : "entry_proposal", source: "local", message: "Verifica la proposta modificabile. Nessun dato è stato salvato.", proposal };
  }
  const orders = workspace.entities.find(e => /order|ordin/i.test(e.name)), tasks = workspace.entities.find(e => /task|attivit/i.test(e.name));
  if (/ritard|delayed/i.test(message) && orders) return { type: "query_results", source: "local", message: "Ordini in ritardo", query: { entityId: orders.id, filters: [{ fieldId: "status", operator: "contains", value: "Delayed" }], metric: "count", fieldId: null, groupBy: null } };
  if (/attivit|tasks/i.test(message) && tasks) return { type: "query_results", source: "local", message: "Attività disponibili", query: { entityId: tasks.id, filters: [], metric: "count", fieldId: null, groupBy: null } };
  if (/attenzion|attention/i.test(message)) return { type: "answer", source: "local", message: workspace.alerts.length ? `${workspace.alerts.length} segnalazioni: ${workspace.alerts.slice(0, 4).map(a => a.title).join("; ")}` : "Non risultano segnalazioni urgenti nel workspace." };
  return { type: "unsupported", source: "local", message: `La modalità locale comprende solo alcune richieste basate sul tuo schema. Puoi provare: ${localExamples(workspace).map(example => `«${example}»`).join("; ")}.` };
}
