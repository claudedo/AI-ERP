import { randomUUID } from "node:crypto";

/**
 * Test-only in-memory stand-in for the `postgres` tagged-template client.
 * It models only what the API relies on: READ COMMITTED visibility (committed rows plus the
 * transaction's own pending rows), all-or-nothing commit, transaction-scoped advisory locks,
 * the organizations.created_by unique index and membership primary keys.
 */
type Row = Record<string, unknown>;
const tables = ["organizations", "memberships", "workspaces", "attachments", "records", "writes"] as const;
type Table = typeof tables[number];
export type FakeState = Record<Table, Row[]>;
const emptyState = (): FakeState => ({ organizations: [], memberships: [], workspaces: [], attachments: [], records: [], writes: [] });

export function createFakeDatabase() {
  let state = emptyState();
  const locks = new Map<string, Promise<void>>();
  const log = { begins: 0, writesOutsideTransaction: [] as string[], queries: [] as string[], locks: [] as string[] };
  let failOn: RegExp | undefined;

  async function acquire(key: string, releases: (() => void)[]) {
    while (locks.has(key)) await locks.get(key);
    let release!: () => void;
    locks.set(key, new Promise<void>(resolve => { release = resolve; }));
    releases.push(() => { locks.delete(key); release(); });
  }

  function client(pending: FakeState | null, releases: (() => void)[]) {
    const view = (table: Table) => pending ? [...state[table], ...pending[table]] : state[table];
    const add = (table: Table, row: Row) => { (pending ?? state)[table].push(row); };
    async function query(text: string, values: unknown[]): Promise<Row[]> {
      log.queries.push(text);
      if (!pending && /^\s*(INSERT|UPDATE|DELETE)/i.test(text)) log.writesOutsideTransaction.push(text);
      // Yield like a network round trip so concurrent transactions can interleave.
      await Promise.resolve();
      if (failOn?.test(text)) throw Object.assign(new Error("Injected database failure"), { name: "PostgresError" });
      if (/pg_advisory_xact_lock/.test(text)) { if (!pending) throw new Error("Advisory xact lock outside a transaction"); log.locks.push(String(values[0])); await acquire(String(values[0]), releases); return [{}]; }
      if (/SELECT \* FROM memberships WHERE user_id=\? AND organization_id=\?/.test(text)) return view("memberships").filter(row => row.user_id === values[0] && row.organization_id === values[1]);
      if (/FROM memberships WHERE user_id=\?/.test(text)) return view("memberships").filter(row => row.user_id === values[0]).sort((a, b) => String(a.organization_id).localeCompare(String(b.organization_id))).slice(0, 1);
      if (/FROM memberships WHERE organization_id=\?/.test(text)) return view("memberships").filter(row => row.organization_id === values[0]);
      if (/^\s*INSERT INTO organizations/.test(text)) {
        if (view("organizations").some(row => row.created_by != null && row.created_by === values[1])) {
          if (/ON CONFLICT/.test(text)) return [];
          throw Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
        }
        const id = randomUUID(); add("organizations", { id, name: values[0], created_by: values[1] }); return [{ id }];
      }
      if (/^\s*INSERT INTO memberships/.test(text)) {
        if (view("memberships").some(row => row.organization_id === values[0] && row.user_id === values[1])) { if (/ON CONFLICT/.test(text)) return []; throw Object.assign(new Error("duplicate key"), { code: "23505" }); }
        add("memberships", { organization_id: values[0], user_id: values[1], role_id: values[2], display_name: values[3] }); return [];
      }
      if (/^\s*INSERT INTO workspaces/.test(text)) {
        if (view("workspaces").some(row => row.organization_id === values[0])) return [];
        add("workspaces", { organization_id: values[0], payload: values[1], revision: 0 }); return [{ organization_id: values[0] }];
      }
      if (/SELECT payload(,revision)? FROM workspaces WHERE organization_id=\?/.test(text)) return view("workspaces").filter(row => row.organization_id === values[0]);
      if (/FROM attachments a WHERE a\.organization_id=\?/.test(text)) return view("attachments").filter(row => row.organization_id === values[0] && row.status === "ready");
      if (/FROM workflow_events/.test(text)) return [];
      if (/SELECT \* FROM attachments WHERE organization_id=\?(::uuid)? AND id=\?/.test(text)) return view("attachments").filter(row => row.organization_id === values[0] && row.id === values[1]);
      if (/SELECT id FROM records WHERE organization_id=\?/.test(text)) return view("records").filter(row => row.organization_id === values[0] && row.entity_id === values[1] && row.id === values[2]);
      const write = /^\s*(?:INSERT INTO|UPDATE|DELETE FROM)\s+(\w+|\?)/i.exec(text);
      if (write) { add("writes", { table: write[1], organizationId: values[0] }); return []; }
      return [];
    }
    const sql = ((first: unknown, ...values: unknown[]) => {
      if (Array.isArray(first) && "raw" in first) return query((first as unknown as string[]).join("?"), values);
      return { helper: first };
    }) as ((first: unknown, ...values: unknown[]) => unknown) & { json: (value: unknown) => unknown; begin?: unknown };
    sql.json = value => value;
    return sql;
  }

  const root = client(null, []);
  root.begin = async (callback: (tx: unknown) => Promise<unknown>) => {
    log.begins++;
    const pending = emptyState(), releases: (() => void)[] = [];
    try {
      const result = await callback(client(pending, releases));
      for (const table of tables) state[table].push(...pending[table]);
      return result;
    } finally { releases.forEach(release => release()); }
  };

  return {
    sql: root,
    log,
    get state() { return state; },
    reset(initial: Partial<FakeState> = {}) {
      state = { ...emptyState(), ...structuredClone(initial) };
      locks.clear(); failOn = undefined;
      log.begins = 0; log.writesOutsideTransaction = []; log.queries = []; log.locks = [];
    },
    failWhen(pattern: RegExp | undefined) { failOn = pattern; },
  };
}

export const fakeDatabase = createFakeDatabase();
