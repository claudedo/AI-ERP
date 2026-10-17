import { useState } from "react";
import {
  Download,
  ExternalLink,
  FilePlus2,
  MessageSquare,
  Paperclip,
} from "lucide-react";
import type { DataRecord, Entity, Workspace } from "../types";
import { openAttachment } from "../services/attachments";

export function RecordDetails({
  entity,
  record,
  workspace,
  canEdit,
  onComment,
  onAttach,
  onRemoveAttachment,
  onOpenRelated,
  onOpenAttachment,
}: {
  entity: Entity;
  record: DataRecord;
  workspace: Workspace;
  canEdit: boolean;
  onComment: (recordId: string, body: string) => boolean | Promise<boolean>;
  onAttach: (recordId: string, file: File) => Promise<boolean>;
  onRemoveAttachment: (id: string) => boolean | Promise<boolean>;
  onOpenRelated: (entityId: string, recordId: string) => void;
  onOpenAttachment?: (
    id: string,
    name: string,
    download: boolean,
  ) => Promise<void>;
}) {
  const [draft, setDraft] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const comments = (workspace.comments || []).filter(
    (c) => c.entityId === entity.id && c.recordId === record.id,
  );
  const attachments = (workspace.attachments || []).filter(
    (a) => a.entityId === entity.id && a.recordId === record.id,
  );
  const outbound = entity.fields
    .filter((f) => f.type === "relation" && f.relationEntityId && record[f.id])
    .flatMap((f) => {
      const target = workspace.entities.find(
          (e) => e.id === f.relationEntityId,
        ),
        linked = target?.records.find((r) => r.id === record[f.id]);
      return target && linked
        ? [{ entity: target, record: linked, label: f.name }]
        : [];
    });
  const inbound = workspace.entities.flatMap((source) =>
    source.fields
      .filter((f) => f.type === "relation" && f.relationEntityId === entity.id)
      .flatMap((f) =>
        source.records
          .filter((r) => r[f.id] === record.id)
          .map((r) => ({ entity: source, record: r, label: source.name })),
      ),
  );
  const related = [...outbound, ...inbound];
  const add = async () => {
    if (await onComment(record.id, draft)) setDraft("");
  };
  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      if (!(await onAttach(record.id, file)))
        setError("The attachment could not be saved.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The attachment could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };
  const open = async (id: string, name: string, download: boolean) => {
    try {
      await (onOpenAttachment || openAttachment)(id, name, download);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Attachment could not be opened.",
      );
    }
  };
  return (
    <div className="record-extras">
      <section>
        <h3>
          Linked records <small>{related.length}</small>
        </h3>
        {related.length ? (
          <div className="related-list">
            {related.map(({ entity: target, record: linked, label }) => (
              <button
                key={`${target.id}:${linked.id}:${label}`}
                onClick={() => onOpenRelated(target.id, linked.id)}
              >
                <span>
                  {label} · {target.name}
                </span>
                <strong>
                  {String(
                    linked[
                      target.fields.find((f) => f.type === "text")?.id || "id"
                    ] || linked.id,
                  )}
                </strong>
                <ExternalLink size={14} />
              </button>
            ))}
          </div>
        ) : (
          <p>No linked records yet.</p>
        )}
      </section>
      <section>
        <h3>
          <MessageSquare size={15} /> Comments <small>{comments.length}</small>
        </h3>
        {comments.map((comment) => (
          <article className="record-comment" key={comment.id}>
            <strong>
              {workspace.users.find((u) => u.id === comment.userId)?.name ||
                "Demo user"}
            </strong>
            <time dateTime={comment.at}>
              {new Date(comment.at).toLocaleString("en-GB")}
            </time>
            <p>{comment.body}</p>
          </article>
        ))}
        {!comments.length && <p>No comments yet.</p>}
        {canEdit && (
          <div className="record-comment-form">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Add a comment. Mention a demo user with @Name."
              aria-label="New comment"
            />
            <button
              className="secondary"
              onClick={add}
              disabled={!draft.trim()}
            >
              Post comment
            </button>
          </div>
        )}
      </section>
      <section>
        <h3>
          <Paperclip size={15} /> Attachments{" "}
          <small>{attachments.length}</small>
        </h3>
        {attachments.map((attachment) => (
          <div className="attachment-row" key={attachment.id}>
            <span>
              {attachment.name}
              <small>
                {(attachment.size / 1024).toFixed(0)} KB · {onOpenAttachment ? "private organization storage" : "saved in this browser"}
              </small>
            </span>
            <button
              aria-label={`Open ${attachment.name}`}
              onClick={() => void open(attachment.id, attachment.name, false)}
            >
              <ExternalLink size={15} />
            </button>
            <button
              aria-label={`Download ${attachment.name}`}
              onClick={() => void open(attachment.id, attachment.name, true)}
            >
              <Download size={15} />
            </button>
            {canEdit && (
              <button
                aria-label={`Remove ${attachment.name}`}
                onClick={() => onRemoveAttachment(attachment.id)}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        {!attachments.length && <p>No attachments yet.</p>}
        {canEdit && (
          <label className="attachment-upload">
            <FilePlus2 size={15} />
            {busy ? "Saving file…" : "Add file · max 10 MB"}
            <input
              type="file"
              disabled={busy}
              onChange={(event) => void upload(event.target.files?.[0])}
            />
          </label>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
