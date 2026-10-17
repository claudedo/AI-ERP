import { Check, ShieldCheck, X } from "lucide-react";
import type { Workspace } from "../types";
import { recordLabel } from "./RecordDrawer";

export function ApprovalsPage({ workspace, canDecide, onDecide, onOpenRecord }: { workspace: Workspace; canDecide: boolean; onDecide: (id: string, status: "approved" | "rejected") => boolean; onOpenRecord: (entityId: string, recordId: string) => void }) {
  const approvals = workspace.approvals || [], pending = approvals.filter(item => item.status === "pending");
  return <div className="entity-page approvals-page"><div className="page-heading"><div><span className="overline">WORKSPACE / GOVERNANCE</span><h1>Approvals</h1><p>{pending.length} pending · decisions are stored in this browser only</p></div></div><div className="approval-list">{approvals.map(approval => {
    const entity = workspace.entities.find(item => item.id === approval.entityId), record = entity?.records.find(item => item.id === approval.recordId);
    return <article key={approval.id}><span className="approval-icon"><ShieldCheck size={18}/></span><div><strong>{entity && record ? recordLabel(entity, record) : approval.recordId}</strong><small>{entity?.name || "Missing module"} · requested {new Date(approval.requestedAt).toLocaleString("en-GB")}</small><span className={`status-pill ${approval.status}`}>{approval.status}</span></div><button className="text-button" onClick={() => onOpenRecord(approval.entityId, approval.recordId)} disabled={!record}>Open record</button>{approval.status === "pending" && canDecide && <div className="approval-actions"><button className="secondary" onClick={() => onDecide(approval.id, "rejected")}><X size={14}/>Reject</button><button className="primary" onClick={() => onDecide(approval.id, "approved")}><Check size={14}/>Approve</button></div>}</article>;
  })}{approvals.length === 0 && <div className="empty-state"><ShieldCheck/><h3>No approvals yet</h3><p>Approval workflows will add requests here when their conditions are met.</p></div>}</div></div>;
}
