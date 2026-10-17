import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { analyzeBusiness, generateArchitectureOptions, generateWorkspace } from "../src/services/aiEngine";
import { localChat } from "../src/ai/localChat";
import { chatErrorMessage } from "../src/ai/chatLanguage";
afterEach(() => vi.unstubAllGlobals());
describe("Italian chat surfaces", () => {
  it("declares the document language and translates errors safely", () => {
    expect(readFileSync(new URL("../index.html", import.meta.url), "utf8")).toContain('lang="it"');
    expect(chatErrorMessage(new Error("Indirizzo is required."))).toBe("Indirizzo è obbligatorio.");
    expect(chatErrorMessage(new Error("Your demo role does not allow this action."))).toMatch(/permessi/);
    expect(chatErrorMessage(new Error("SQL backend failure: private details"))).not.toContain("private details");
  });
  it("keeps the fallback structural explanation in Italian", async () => {
    const a = analyzeBusiness("customers and orders"), w = generateWorkspace(a, generateArchitectureOptions(a)[2]);
    const result = await localChat("Crea un modulo Qualità con nome e data", w);
    expect(result.type).toBe("structure_proposal");
    if (result.type === "structure_proposal") { expect(result.proposal.interpretation).not.toMatch(/^Create /); expect(result.proposal.impact).not.toContain("Creates a draft"); }
  });
});
