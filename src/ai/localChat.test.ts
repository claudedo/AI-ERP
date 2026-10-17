import { describe, expect, it } from "vitest";
import { analyzeBusiness, generateArchitectureOptions, generateWorkspace } from "../services/aiEngine";
import { localChat } from "./localChat";
import { executeChatQuery } from "./chatQueries";
const fixture = () => {
  const a = analyzeBusiness("real estate agency"), w = generateWorkspace(a, generateArchitectureOptions(a)[2]);
  w.entities = [{ id: "properties", name: "Properties", fields: [{ id: "address", name: "Address", type: "text", required: true }, { id: "city", name: "City", type: "text" }, { id: "askingPrice", name: "Asking price", type: "currency" }, { id: "phase", name: "Phase", type: "status", options: ["For sale", "Sold"] }], records: [{ id: "p1", address: "Via Roma 1", phase: "For sale" }, { id: "p2", address: "Via Roma 2", phase: "Sold" }] }];
  w.workflows = []; w.views = []; return w;
};
describe("schema-driven local fallback", () => {
  it("counts properties for sale using the real state field and options", async () => {
    const w = fixture(), result = await localChat("Quanti immobili abbiamo in vendita?", w);
    expect(result.type).toBe("query_results");
    if (result.type !== "query_results") throw Error("Query expected");
    expect(result.query).toMatchObject({ entityId: "properties", filters: [{ fieldId: "phase", operator: "equals", value: "For sale" }] });
    expect(executeChatQuery(w, result.query).count).toBe(1);
  });
  it("extracts address, city and asking price without saving", async () => {
    const w = fixture(), before = JSON.stringify(w), result = await localChat("Aggiungi un nuovo immobile in via Emilia 10 a Modena da 450 mila euro", w);
    expect(result.type).toBe("entry_proposal");
    if (result.type !== "entry_proposal") throw Error("Proposal expected");
    expect(result.proposal.operations[0].record).toMatchObject({ address: "via Emilia 10", city: "Modena", askingPrice: 450000 });
    expect(result.proposal.questions).toEqual([]); expect(JSON.stringify(w)).toBe(before);
  });
  it("asks about unavailable/ambiguous states instead of silently counting all records", async () => {
    const w = fixture(); w.entities[0].fields[3].options = ["Open", "Closed"];
    expect((await localChat("Quanti immobili abbiamo in vendita?", w)).type).toBe("clarification");
  });
  it("offers three examples based on actual modules", async () => {
    const result = await localChat("Parlami del meteo", fixture());
    expect(result.type).toBe("unsupported"); expect(result.message).toContain("Properties"); expect(result.message.match(/«/g)).toHaveLength(3);
  });
});
