import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { SmartEntry } from "../components/SmartEntry";
import { analyzeBusiness, generateArchitectureOptions, generateWorkspace } from "./aiEngine";
afterEach(() => vi.unstubAllGlobals());
it("renders schema field names rather than internal IDs in data preview", () => {
  vi.stubGlobal("localStorage", { getItem: () => null }); vi.stubGlobal("document", { activeElement: null }); vi.stubGlobal("HTMLElement", class {});
  const a = analyzeBusiness("real estate agency"), w = generateWorkspace(a, generateArchitectureOptions(a)[2]);
  w.entities.find(e => e.id === "properties")!.fields.find(f => f.id === "address")!.name = "Indirizzo personalizzato";
  const markup = renderToStaticMarkup(createElement(SmartEntry, { embedded: true, workspace: w, initialProposal: { id: "p", request: "Aggiungi un immobile", baseRevision: 0, operations: [{ entityId: "properties", kind: "create", record: { id: "new", address: "Via Emilia 10" } }], questions: [], builder: false }, onClose: () => {}, onBuilder: () => {}, onApply: () => false }));
  expect(markup).toContain("Indirizzo personalizzato"); expect(markup).toContain('aria-label="Indirizzo personalizzato"');
});
