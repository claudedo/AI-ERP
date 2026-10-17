import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { analyzeBusiness, generateArchitectureOptions, generateWorkspace } from "./aiEngine";
import { localConfigurationProvider } from "../ai/configurationProvider";
import { publishConfiguration, stageProposal } from "./configuration";
import { reviewStructure } from "./structureReview";
import { StructureOperations } from "../components/StructureOperations";

const fixture = () => { const a = analyzeBusiness("customers and orders"); return generateWorkspace(a, generateArchitectureOptions(a)[2]); };
describe("detailed editable structural preview", () => {
  it("shows the three proposed fields and publishes only the included fields", async () => {
    const w = fixture(), p = await localConfigurationProvider.propose("Crea un modulo Controllo qualità con nome, esito e data", w);
    const markup = renderToStaticMarkup(createElement(StructureOperations, { proposal: p, workspace: w, excluded: [], onToggle: () => {} }));
    for (const text of ["Controllo qualità", "nome", "esito", "data", "Testo", "Data"]) expect(markup).toContain(text);
    const reviewed = reviewStructure(w, p, ["field:0:esito"]), saved = publishConfiguration(stageProposal(w, reviewed));
    expect(saved.entities.find(e => e.name === "Controllo qualità")!.fields.map(f => f.id)).toEqual(["nome", "data"]);
    expect(w.entities.some(e => e.name === "Controllo qualità")).toBe(false);
  });
  it("rejects an empty selection, ambiguity and stale proposals before confirmation", async () => {
    const w = fixture(), p = await localConfigurationProvider.propose("Crea un modulo Qualità con nome e data", w);
    expect(() => reviewStructure(w, p, ["operation:0"])).toThrow();
    expect(() => reviewStructure(w, { ...p, ambiguities: ["Quale modulo?"] }, [])).toThrow();
    expect(() => reviewStructure({ ...w, revision: 1 }, p, [])).toThrow(/stale/);
  });
});
