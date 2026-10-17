import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { authenticate, database, HttpError, identity, required, respond, withMembers } from "../../server/platform";
import { persistWorkspace } from "../../server/repository";
import { actionSchema, dispatchWorkspaceAction } from "../../src/services/workspaceActions";
import { configurationOf, proposalSchema, applyConfigurationOperations } from "../../src/services/configuration";
import { applicableWorkflows, requirePermission } from "../../src/services/workspaceDomain";
import { analyzeBusiness, generateArchitectureOptions, generateWorkspace, interpretCommand } from "../../src/services/aiEngine";
import { answerOperator } from "../../src/services/operatorEngine";
import type { Workspace } from "../../src/types";
import { chatErrorMessage } from "../../src/ai/chatLanguage";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("mutate"), expectedRevision: z.number().int().nonnegative(), requestId: z.string().uuid(), command: actionSchema }).strict(),
  z.object({ action: z.literal("initialize"), name: z.string().trim().min(1).max(100) }).strict(),
  z.object({ action: z.literal("invite"), email: z.string().email(), role: z.enum(["manager", "operator", "viewer"]), name: z.string().min(1).max(100) }).strict(),
  z.object({ action: z.literal("propose"), request: z.string().min(1).max(4000), expectedRevision: z.number().int().nonnegative() }).strict(),
  z.object({ action: z.literal("operator"), request: z.string().min(1).max(4000) }).strict(),
  z.object({ action: z.literal("attachmentInit"), entityId: z.string(), recordId: z.string(), filename: z.string().min(1).max(200), mime: z.string().max(150), size: z.number().int().min(0).max(10485760) }).strict(),
  z.object({ action: z.literal("attachmentComplete"), id: z.string().uuid() }).strict(),
  z.object({ action: z.literal("attachmentUrl"), id: z.string().uuid() }).strict(),
  z.object({ action: z.literal("attachmentDelete"), id: z.string().uuid() }).strict()
]);
export default async function handler(request: Request): Promise<Response> {
  try {
    if (!["GET", "POST"].includes(request.method)) throw new HttpError(405, "Method not allowed.");
    const principal = await authenticate(request), sql = database();
    const rows = await sql`SELECT payload FROM workspaces WHERE organization_id=${principal.organizationId}::uuid`;
    let workspace = rows[0] ? await withMembers(rows[0].payload as Workspace, principal) : null;
    if (request.method === "GET") {
      const attachments = await sql`SELECT a.id,a.entity_id,a.record_id,a.filename,a.mime,a.size,a.status FROM attachments a WHERE a.organization_id=${principal.organizationId}::uuid AND a.status='ready' AND EXISTS(SELECT 1 FROM records r WHERE r.organization_id=a.organization_id AND r.entity_id=a.entity_id AND r.id=a.record_id)`;
      const events = await sql`SELECT id,status,attempts,error,created_at FROM workflow_events WHERE organization_id=${principal.organizationId}::uuid ORDER BY created_at DESC LIMIT 30`;
      return respond({ workspace, organizationId: principal.organizationId, role: principal.roleId, attachments, events, aiConfigured: !!process.env.AI_PROVIDER_URL && !!process.env.AI_PROVIDER_API_KEY });
    }
    if (!request.headers.get("content-type")?.includes("application/json")) throw new HttpError(415, "Use application/json.");
    const text = await request.text();
    if (text.length > 1048576) throw new HttpError(413, "Request exceeds 1 MB.");
    const body = requestSchema.parse(JSON.parse(text));
    if (body.action === "initialize") {
      if (principal.roleId !== "admin") throw new HttpError(403, "Only an organization admin can initialize a workspace.");
      const analysis = analyzeBusiness("customers and orders");
      workspace = generateWorkspace(analysis, generateArchitectureOptions(analysis)[2]);
      workspace.companyName = body.name; workspace.entities.forEach(entity => { entity.records = []; }); workspace.workflows = []; workspace.alerts = []; workspace.version = 4; workspace.configurationVersion = 1;
      workspace = await withMembers(workspace, principal);
      const initial = workspace;
      await sql.begin(async tx => {
        const inserted = await tx`INSERT INTO workspaces(organization_id,payload) VALUES(${principal.organizationId}::uuid,${tx.json(initial as never)}) ON CONFLICT DO NOTHING RETURNING organization_id`;
        if (!inserted.length) throw new HttpError(409, "Workspace already exists. Refresh the page.");
        await persistWorkspace(tx, principal.organizationId, principal.userId, initial);
      });
      return respond({ workspace });
    }
    if (!workspace) throw new HttpError(404, "Ask an admin to initialize this organization workspace.");
    if (body.action === "mutate") {
      const hash = createHash("sha256").update(JSON.stringify(body.command)).digest("hex");
      const next = await sql.begin(async tx => {
        const [locked] = await tx`SELECT payload,revision FROM workspaces WHERE organization_id=${principal.organizationId}::uuid FOR UPDATE`;
        if (!locked) throw new HttpError(404, "Workspace is unavailable.");
        const [receipt] = await tx`SELECT request_hash,response FROM action_receipts WHERE organization_id=${principal.organizationId}::uuid AND request_id=${body.requestId}::uuid`;
        if (receipt) { if (receipt.request_hash !== hash) throw new HttpError(409, "Request identifier was reused for another action."); return receipt.response as Workspace; }
        if (Number(locked.revision) !== body.expectedRevision) throw new HttpError(409, "Another member changed the workspace. Refresh and retry; no changes were applied.");
        const current = await withMembers(locked.payload as Workspace, principal, tx);
        const updated = dispatchWorkspaceAction(current, body.command, true);
        await persistWorkspace(tx, principal.organizationId, principal.userId, updated, locked.payload as Workspace);
        if (body.command.type === "saveRecord") {
          const command = body.command, previous = current.entities.find(entity => entity.id === command.entityId)?.records.find(record => record.id === command.record.id);
          const saved = updated.entities.find(entity => entity.id === command.entityId)!.records.find(record => record.id === command.record.id)!;
          const entity = updated.entities.find(entity => entity.id === command.entityId)!;
          if (applicableWorkflows(updated, entity, saved, previous).length) await tx`INSERT INTO workflow_events(organization_id,actor_id,entity_id,record_id,record,previous_record) VALUES(${principal.organizationId}::uuid,${principal.userId}::uuid,${command.entityId},${saved.id},${tx.json(saved as never)},${previous ? tx.json(previous as never) : null})`;
        }
        if(body.command.type==="smartEntry"&&!current.appliedEntries?.includes(body.command.proposal.id))for(const operation of body.command.proposal.operations){const previous=current.entities.find(e=>e.id===operation.entityId)?.records.find(r=>r.id===operation.record.id),entity=updated.entities.find(e=>e.id===operation.entityId)!,saved=entity.records.find(r=>r.id===operation.record.id)!;if(applicableWorkflows(updated,entity,saved,previous).length)await tx`INSERT INTO workflow_events(organization_id,actor_id,entity_id,record_id,record,previous_record) VALUES(${principal.organizationId}::uuid,${principal.userId}::uuid,${operation.entityId},${saved.id},${tx.json(saved as never)},${previous?tx.json(previous as never):null})`}
        await tx`INSERT INTO audit_log(organization_id,actor_id,action,detail) VALUES(${principal.organizationId}::uuid,${principal.userId}::uuid,${body.command.type},${tx.json({ revision: updated.revision } as never)})`;
        await tx`INSERT INTO action_receipts(organization_id,request_id,request_hash,response) VALUES(${principal.organizationId}::uuid,${body.requestId}::uuid,${hash},${tx.json(updated as never)})`;
        return updated;
      });
      return respond({ workspace: next });
    }
    if (body.action === "invite") {
      if (principal.roleId !== "admin") throw new HttpError(403, "Only an organization admin can invite members.");
      const { data, error } = await identity().auth.admin.inviteUserByEmail(body.email, { redirectTo: required("APP_ORIGIN"), data: { name: body.name } });
      if (error || !data.user) throw new HttpError(502, "The identity provider could not send the invitation. Check provider logs and email configuration.");
      await sql`INSERT INTO memberships(organization_id,user_id,role_id,display_name) VALUES(${principal.organizationId}::uuid,${data.user.id}::uuid,${body.role},${body.name}) ON CONFLICT DO NOTHING`;
      await sql`INSERT INTO audit_log(organization_id,actor_id,action,detail) VALUES(${principal.organizationId}::uuid,${principal.userId}::uuid,'invite',${sql.json({ invitedUserId: data.user.id, role: body.role })})`;
      return respond({ message: "Invitation accepted by the identity provider. Email delivery is not independently verified." });
    }
    if (body.action === "operator") return respond({ result: answerOperator(interpretCommand(body.request), workspace) });
    if (body.action === "propose") {
      requirePermission(workspace, "editStructure");
      if (body.expectedRevision !== (workspace.revision || 0)) throw new HttpError(409, "Workspace changed. Refresh before requesting a proposal.");
      const url = new URL(required("AI_PROVIDER_URL"));
      if (url.protocol !== "https:") throw new HttpError(503, "AI provider must use HTTPS.");
      const providerResponse = await fetch(url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(25000), headers: { "Content-Type": "application/json", Authorization: `Bearer ${required("AI_PROVIDER_API_KEY")}` }, body: JSON.stringify({ request: body.request, configuration: workspace.configurationDraft?.configuration || configurationOf(workspace), baseRevision: workspace.revision || 0, responseSchema: z.toJSONSchema(proposalSchema) }) });
      if (!providerResponse.ok) throw new HttpError(502, "AI provider failed. No configuration was changed.");
      const responseText = await providerResponse.text();
      if (responseText.length > 250000) throw new HttpError(502, "AI response is too large.");
      const proposal = proposalSchema.parse(JSON.parse(responseText));
      proposal.baseRevision = workspace.revision || 0; proposal.request = body.request;
      if (!proposal.ambiguities.length) applyConfigurationOperations(workspace.configurationDraft?.configuration || configurationOf(workspace), proposal.operations);
      return respond({ proposal });
    }
    const bucket = identity().storage.from(required("SUPABASE_STORAGE_BUCKET"));
    if (body.action === "attachmentInit") {
      requirePermission(workspace, "editRecords");
      if (!workspace.entities.find(entity => entity.id === body.entityId)?.records.some(record => record.id === body.recordId)) throw new HttpError(404, "Record not found.");
      if (/html|javascript|svg/i.test(body.mime)) throw new HttpError(400, "Active web content is not supported as an attachment.");
      const attachmentId = randomUUID(), path = `${principal.organizationId}/${attachmentId}`;
      const { data, error } = await bucket.createSignedUploadUrl(path, { upsert: false });
      if (error) throw new HttpError(502, "Private storage could not authorize the upload.");
      await sql`INSERT INTO attachments(organization_id,id,entity_id,record_id,object_path,filename,mime,size,created_by) VALUES(${principal.organizationId}::uuid,${attachmentId}::uuid,${body.entityId},${body.recordId},${path},${body.filename},${body.mime},${body.size},${principal.userId}::uuid)`;
      return respond({ id: attachmentId, uploadUrl: data.signedUrl });
    }
    const [attachment] = await sql`SELECT * FROM attachments WHERE organization_id=${principal.organizationId}::uuid AND id=${body.id}::uuid`;
    if (!attachment) throw new HttpError(404, "Attachment not found.");
    // Orphans remain deletable for cleanup, but must never be completed or downloaded.
    if (body.action !== "attachmentDelete") {
      const [record] = await sql`SELECT id FROM records WHERE organization_id=${principal.organizationId}::uuid AND entity_id=${attachment.entity_id} AND id=${attachment.record_id}`;
      if (!record) throw new HttpError(404, "The attachment's record no longer exists.");
    }
    if (body.action === "attachmentComplete") {
      requirePermission(workspace, "editRecords");
      const { data, error } = await bucket.info(attachment.object_path);
      if (error || !data || data.size !== Number(attachment.size)) throw new HttpError(409, "Uploaded object is missing or its size differs from the declared file.");
      await sql`UPDATE attachments SET status='ready' WHERE organization_id=${principal.organizationId}::uuid AND id=${body.id}::uuid`;
      return respond({ ready: true });
    }
    if (body.action === "attachmentDelete") {
      requirePermission(workspace, "editRecords");
      const { error } = await bucket.remove([attachment.object_path]);
      if (error) throw new HttpError(502, "Private storage could not delete the file.");
      await sql`DELETE FROM attachments WHERE organization_id=${principal.organizationId}::uuid AND id=${body.id}::uuid`;
      return respond({ removed: true });
    }
    if (attachment.status !== "ready") throw new HttpError(409, "Upload is not complete.");
    const { data, error } = await bucket.createSignedUrl(attachment.object_path, 60, { download: attachment.filename });
    if (error) throw new HttpError(502, "Private storage could not authorize the download.");
    return respond({ url: data.signedUrl, expiresIn: 60 });
  } catch (error) {
    if (error instanceof HttpError) return respond({ error: chatErrorMessage(error) }, error.status);
    if (error instanceof z.ZodError || error instanceof SyntaxError) return respond({ error: "Richiesta non valida. Nessuna operazione applicata." }, 400);
    if (error instanceof Error && error.constructor.name === "DomainError") return respond({ error: chatErrorMessage(error) }, 403);
    // Do not expose SQL, credentials, provider bodies or database connection strings.
    console.error("NODUS API operation failed", error instanceof Error ? error.name : "UnknownError");
    return respond({ error: "Operazione non riuscita. Aggiorna il workspace e riprova; se il problema persiste contatta l’amministratore." }, 500);
  }
}
