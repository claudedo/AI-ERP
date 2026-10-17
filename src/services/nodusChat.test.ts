import { describe, expect, it } from "vitest";
import { chatIntent, loadConversation } from "./nodusChat";

const storage = (values: Record<string, string>) => ({ getItem: (key: string) => values[key] || null });
describe("one NODUS conversation", () => {
  it.each([
    ["Show me delayed orders", "question"],
    ["What needs attention today?", "question"],
    ["Crea un ordine per Rossi: 2 sedie a 10 euro, stato Nuovo", "records"],
    ["Update ORD-1048 delivery to Friday", "records"],
    ["Crea un modulo Campionari con codice, stato", "structure"],
    ["Add a Priority field to Orders", "structure"],
    ["Add a status to Orders", "structure"],
  ])("routes %s without a mode switch", (text, intent) => expect(chatIntent(text)).toBe(intent));
  it("migrates both legacy conversations without deleting them", () => {
    const values = { "nodus-conversation-w-operator": JSON.stringify({ messages: [{ q: "Orders?", a: "2" }] }), "nodus-conversation-w-builder": JSON.stringify({ input: "draft", messages: [{ q: "Field?", a: "Preview" }] }) };
    const loaded = loadConversation(storage(values), "w");
    expect(loaded.messages).toHaveLength(2); expect(loaded.input).toBe("draft"); expect(Object.keys(values)).toHaveLength(2);
  });
  it("uses unified history even when an old conversation is corrupt", () => {
    expect(loadConversation(storage({ "nodus-ai-w": JSON.stringify({ input: "current", messages: [{ q: "a", a: "b" }] }), "nodus-conversation-w-operator": "broken" }), "w").input).toBe("current");
  });
  it("ignores malformed stored proposals and messages", () => {
    const loaded = loadConversation(storage({ "nodus-ai-w": JSON.stringify({ entry: { operations: ["bad"] }, messages: [null, 7, { q: "valid", a: "answer" }, { q: "invalid" }] }) }), "w");
    expect(loaded.entry).toBeNull(); expect(loaded.messages).toEqual([{ q: "valid", a: "answer" }]);
  });
  it("isolates conversation by workspace", () => expect(loadConversation(storage({ "nodus-ai-other": JSON.stringify({ input: "private" }) }), "w").input).toBe(""));
});
