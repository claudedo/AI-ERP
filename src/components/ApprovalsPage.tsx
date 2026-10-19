import { Check, ShieldCheck, X } from "lucide-react";
import type { Workspace } from "../types";
import { recordLabel } from "./RecordDrawer";

export function ApprovalsPage({ workspace, canDecide, onDecide, onOpenRecord }: { workspace: Workspace; canDecide: boolean; onDecide: (id: string, status: "approved" | "rejected") => boolean; onOpenRecord: (entityId: string, recordId: string) => void }) {
  const approvals = workspace.approvals || [], pending = approvals.filter(item => item.status === "pending");
  return <div className="entity-page approvals-page"><div className="page-heading"><div><span className="overline">WORKSPACE / GOVERNANCE</span><h1>Approvazioni</h1><p>{pending.length} in attesa · le decisioni sono salvate solo in questo browser</p></div></div><div className="approval-list">{approvals.map(approval => {
    const entity = workspace.entities.find(item => item.id === approval.entityId), record = entity?.records.find(item => item.id === approval.recordId);
    return <article key={approval.id}><span className="approval-icon"><ShieldCheck size={18}/></span><div><strong>{entity && record ? recordLabel(entity, record) : approval.recordId}</strong><small>{entity?.name || "Modulo mancante"} · richiesta il {new Date(approval.requestedAt).toLocaleString("it-IT")}</small><span className={`status-pill ${approval.status}`}>{({ pending: "In attesa", approved: "Approvata", rejected: "Rifiutata" } as Record<string, string>)[approval.status] ?? approval.status}</span></div><button className="text-button" onClick={() => onOpenRecord(approval.entityId, approval.recordId)} disabled={!record}>Apri record</button>{approval.status === "pending" && canDecide && <div className="approval-actions"><button className="secondary" onClick={() => onDecide(approval.id, "rejected")}><X size={14}/>Rifiuta</button><button className="primary" onClick={() => onDecide(approval.id, "approved")}><Check size={14}/>Approva</button></div>}</article>;
  })}{approvals.length === 0 && <div className="empty-state"><ShieldCheck/><h3>Nessuna approvazione</h3><p>I workflow di approvazione aggiungeranno qui le richieste quando le condizioni saranno soddisfatte.</p></div>}</div></div>;
}
