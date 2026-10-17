import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeBusiness, generateArchitectureOptions, generateWorkspace } from "../src/services/aiEngine";
const { query, persist } = vi.hoisted(() => ({ query: vi.fn(), persist: vi.fn() }));
vi.mock("./repository", () => ({ persistWorkspace: persist }));
vi.mock("./attachmentCleanup", () => ({ cleanupOrphanAttachments: async () => 0 }));
vi.mock("./platform", () => ({ database: () => ({ begin: (callback: (sql: unknown) => unknown) => callback(Object.assign(query, { savepoint: (job: (sql: unknown) => unknown) => job(query) })) }), authorizeMembership: () => ({ userId: "admin", organizationId: "org", roleId: "admin" }), withMembers: async (w: unknown) => w, respond: (data: unknown) => new Response(JSON.stringify(data)) }));
import worker from "../netlify/functions/workflow-worker";
import { applicableWorkflows } from "../src/services/workspaceDomain";
import { executeWorkflowEvent } from "./workflowExecution";
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
describe("queued workflow no-ops", () => {
  it("queues only active matching workflows and does not revise equal-value actions", () => {
    const a = analyzeBusiness("customers and orders"), w = generateWorkspace(a, generateArchitectureOptions(a)[2]), entity = w.entities[0], record = entity.records[0];
    w.workflows = [{ id: "same-value", name: "Same value", active: true, trigger: "update", actions: [], runs: [], config: { entityId: entity.id, event: "update", fieldId: "name", action: "update-field", targetFieldId: "name", targetValue: String(record.name) } }];
    const previous = { ...record, name: "Before" };
    expect(applicableWorkflows(w, entity, record, previous)).toHaveLength(1);
    expect(executeWorkflowEvent(w, entity.id, record.id, previous)).toBeNull();
    w.workflows[0].active = false; expect(applicableWorkflows(w, entity, record, previous)).toEqual([]);
    w.workflows[0].active = true; expect(applicableWorkflows(w, entity, record, record)).toEqual([]);
  });
  it("completes an event without workflows without incrementing revision or persisting", async () => {
    vi.stubEnv("DATABASE_URL", "test-only"); vi.stubEnv("SUPABASE_URL", "test-only");
    const a = analyzeBusiness("customers and orders"), w = generateWorkspace(a, generateArchitectureOptions(a)[2]);
    w.workflows = []; w.revision = 7; const entity = w.entities[0], record = entity.records[0]; let events = 0;
    query.mockImplementation(async (parts: TemplateStringsArray) => {
      const sql = parts.join("");
      if (sql.includes("SELECT * FROM workflow_events")) return events++ ? [] : [{ id: "event", organization_id: "org", actor_id: "admin", entity_id: entity.id, record_id: record.id, record }];
      if (sql.includes("SELECT payload")) return [{ payload: w }];
      if (sql.includes("SELECT * FROM memberships")) return [{}];
      return [];
    });
    await worker(); expect(w.revision).toBe(7); expect(persist).not.toHaveBeenCalled();
  });
});
