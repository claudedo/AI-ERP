import { describe, expect, it } from "vitest";
import { normaliseStatus, statusTone } from "./statusTone";

describe("statusTone", () => {
  it("maps finished, paid and confirmed states to success in English and Italian", () => {
    for (const value of ["Done", "Completed", "Delivered", "Approved", "Paid", "Won", "Sold", "Active", "Confirmed", "On track",
      "Ricevuto", "Pagata", "Completato", "Consegnato", "Approvata", "Venduto", "Attivo", "Confermato"])
      expect(statusTone(value), value).toBe("success");
  });

  it("maps waiting and in-progress states to warning", () => {
    for (const value of ["Pending", "In progress", "Review", "Legal review", "Draft", "Negotiating", "Under offer", "In production",
      "In attesa", "In corso", "Bozza", "Trattativa", "In trattativa"])
      expect(statusTone(value), value).toBe("warning");
  });

  it("maps late, blocked and lost states to danger", () => {
    for (const value of ["Delayed", "Blocked", "Overdue", "Lost", "Declined", "Rejected", "Cancelled", "At risk",
      "In ritardo", "Bloccato", "Scaduto", "Perso", "Rifiutato", "Annullato", "A rischio"])
      expect(statusTone(value), value).toBe("danger");
  });

  it("keeps unknown, descriptive and empty values neutral", () => {
    for (const value of ["Listed", "Available", "Cliente", "Fornitore", "Mayfair", "Nuovo", "", null, undefined, 42])
      expect(statusTone(value), String(value)).toBe("neutral");
  });

  it("ignores case, accents, separators and extra spaces", () => {
    expect(normaliseStatus("  IN_PROGRESS ")).toBe("in progress");
    expect(statusTone("on-track")).toBe("success");
    expect(statusTone("A   RISCHIO")).toBe("danger");
    expect(statusTone("Approvàta")).toBe("success");
  });

  it("matches whole values only, so partial words are not guessed", () => {
    expect(statusTone("Not approved yet")).toBe("neutral");
    expect(statusTone("Soldier")).toBe("neutral");
  });
});
