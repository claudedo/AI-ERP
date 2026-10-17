import { z } from "zod";
import type { DataRecord, Entity, Workspace } from "../types";
import {
  newId,
  DomainError,
  requirePermission,
  saveRecord,
  validateRecord,
} from "./workspaceDomain";
import { parseDate, parseItalianNumber } from "./importExport";
import { creationTarget, entryMatchesIntent, isPropertyEntity } from "./entryIntent";

const scalar = z.union([
  z.string().max(10000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
export const entrySchema = z.object({
  id: z.string().min(1).max(160),
  request: z.string().max(10000),
  baseRevision: z.number().int().nonnegative(),
  operations: z
    .array(
      z.object({
        entityId: z.string().min(1).max(100),
        kind: z.enum(["create", "update"]),
        record: z
          .record(
            z
              .string()
              .refine(
                (k) => !["__proto__", "constructor", "prototype"].includes(k),
              ),
            scalar,
          )
          .refine(
            (value) =>
              typeof value.id === "string" &&
              value.id.length > 0 &&
              value.id.length <= 160,
            "Record identifier is required.",
          ),
      }),
    )
    .max(50),
  questions: z.array(z.string().max(5000)).max(50),
  builder: z.boolean(),
});
export type EntryProposal = z.infer<typeof entrySchema>;
const norm = (s: unknown) =>
  String(s || "")
    .trim()
    .toLocaleLowerCase();
export function absoluteDate(text: string, now = new Date()): string | null {
  const explicit = text.match(
    /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})\b/,
  )?.[0];
  if (explicit) return parseDate(explicit);
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (/\bdomani\b/i.test(text)) d.setDate(d.getDate() + 1);
  else if (!/\boggi\b/i.test(text)) {
    const days = [
        "domenica",
        "lunedì",
        "martedì",
        "mercoledì",
        "giovedì",
        "venerdì",
        "sabato",
      ],
      day = days.findIndex((v) => norm(text).includes(v));
    if (day < 0) return null;
    d.setDate(d.getDate() + ((day - d.getDay() + 7) % 7 || 7));
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function proposeEntry(
  request: string,
  w: Workspace,
  contextId?: string,
  now = new Date(),
  resolution: { company?: string } = {},
): EntryProposal {
  const proposal: EntryProposal = {
    id: newId("entry"),
    request,
    baseRevision: w.revision || 0,
    operations: [],
    questions: [],
    builder: false,
  };
  const add = (
    entity: Entity,
    record: DataRecord,
    kind: "create" | "update" = "create",
  ) => proposal.operations.push({ entityId: entity.id, kind, record });
  const companies = w.entities.find((e) => e.id === "companies"),
    sites = w.entities.find((e) => e.id === "company-sites"),
    contacts = w.entities.find((e) => e.id === "company-contacts");
  const resolve = (entity: Entity, name: string): DataRecord | undefined => {
    if (entity.id === "companies" && resolution.company)
      return entity.records.find((r) => r.id === resolution.company);
    const matches = entity.records.filter((r) =>
      [r.id, r.name, r.orderNo, r.tradeName].some(
        (v) => norm(v) === norm(name),
      ),
    );
    if (matches.length > 1) {
      proposal.questions.push(
        `Più corrispondenze per “${name}”: seleziona l’azienda di riferimento e rigenera.`,
      );
      return undefined;
    }
    return matches[0];
  };
  const company = (name: string, role: string): DataRecord | undefined => {
    if (!companies) {
      proposal.builder = true;
      proposal.questions.push(
        "Il workspace non dispone dell’anagrafica aziende. Apri il Builder.",
      );
      return;
    }
    const existing = resolve(companies, name);
    if (proposal.questions.length) return;
    if (existing)
      return {
        ...existing,
        partyRole: existing.partyRole === role ? role : "Entrambi",
      };
    const draft: DataRecord = {
      id: newId("company"),
      name: name.trim(),
      partyRole: role,
    };
    add(companies, draft);
    return draft;
  };
  const supplier = /\bfornitor[ei]\b/i.test(request),
    create = /\b(crea|creare|aggiungi|aggiungere|inserisci|inserire|registra|registrare|create|add)\b/i.test(request),
    target = creationTarget(request);
  if (create && target === "property") {
    const candidates = w.entities.filter(e => !e.archived && isPropertyEntity(e));
    const entity = candidates.find(e => e.id === contextId) || (candidates.length === 1 ? candidates[0] : undefined);
    if (!entity) {
      proposal.questions.push(candidates.length ? "Quale modulo immobili vuoi utilizzare?" : "Il workspace non contiene un modulo immobili. Indica il modulo corretto: non creerò un’azienda al suo posto.");
      return proposal;
    }
    const record: DataRecord = { id: newId("property") };
    const amount = request.match(/(\d[\d.,]*)\s*(mila|milion[ei])?\s*(?:euro|€)/i) || request.match(/€\s*(\d[\d.,]*)\s*(mila|milion[ei])?/i);
    const prices = entity.fields.filter(f => f.type === "currency" && /asking|price|prezzo|valore|amount|importo/i.test(f.id + f.name));
    const price = prices.find(f => f.id === "askingPrice") || (prices.length === 1 ? prices[0] : undefined);
    if (amount) {
      const value = parseItalianNumber(amount[1]);
      if (price && value !== null) record[price.id] = value * (/^mila$/i.test(amount[2] || "") ? 1000 : /^milion/i.test(amount[2] || "") ? 1000000 : 1);
      else proposal.questions.push("In quale campo prezzo vuoi inserire l’importo indicato?");
    }
    const location = request.match(/\b((?:via|viale|piazza|corso|vicolo|strada)\s+[^;\n]+?\s+\d+[A-Za-z]?(?:[/-]\d+)?)(?:\s+(?:a|in)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’ -]*?))?(?=\s+(?:da|a|per)\s+\d|[;,\n.]|$)/i);
    if (location) {
      const address = entity.fields.filter(f => f.type === "text" && /address|indirizz|street/i.test(f.id + f.name));
      const city = entity.fields.filter(f => f.type === "text" && /city|citt[aà]/i.test(f.id + f.name));
      if (address.length === 1) record[address[0].id] = location[1].trim();
      if (city.length === 1 && location[2]) record[city[0].id] = location[2].trim();
    }
    for (const field of entity.fields.filter(f => !f.formula)) {
      const escaped = [field.name, field.id].map(v => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      if (field.id === "reference") escaped.push("riferimento", "codice");
      if (field.id === "address") escaped.push("indirizzo");
      if (field.id === "askingPrice") escaped.push("prezzo");
      if (field.id === "city") escaped.push("città", "citta");
      const value = [...request.matchAll(new RegExp(`(?:^|[;\\n])\\s*(?:${escaped.join("|")})\\s*:\\s*([^;\\n]+)`, "gi"))].at(-1)?.[1]?.trim();
      if (!value) continue;
      if (field.type === "relation") {
        const related = w.entities.find(e => e.id === field.relationEntityId);
        const matches = related?.records.filter(r => [r.id, r.name, r.reference].some(v => norm(v) === norm(value))) || [];
        if (matches.length === 1) record[field.id] = matches[0].id;
        else proposal.questions.push(`Indica un collegamento univoco per ${field.name}.`);
      } else if (["number", "currency"].includes(field.type)) {
        const quantity = value.match(/^(\d[\d.,]*)\s*(mila|milion[ei])?/i), parsed = quantity ? parseItalianNumber(quantity[1]) : null;
        if (parsed !== null) record[field.id] = parsed * (/^mila$/i.test(quantity?.[2] || "") ? 1000 : /^milion/i.test(quantity?.[2] || "") ? 1000000 : 1);
      } else if (field.type === "date") { const date = absoluteDate(value, now); if (date) record[field.id] = date; }
      else if (field.type === "checkbox") record[field.id] = /^(sì|si|true|yes)$/i.test(value);
      else record[field.id] = value;
    }
    const identifiers = entity.fields.filter(f => /^(reference|riferimento|address|indirizzo|name|nome|title|titolo|codice)$/.test(f.id));
    if (!identifiers.some(f => String(record[f.id] || "").trim())) proposal.questions.push("Qual è il riferimento o l’indirizzo della proprietà? L’importo è stato estratto, ma non inventerò un’identificazione o un proprietario.");
    for (const field of entity.fields.filter(f => f.required)) if (record[field.id] == null || record[field.id] === "") proposal.questions.push(`Specifica ${field.name}.`);
    add(entity, record);
    return proposal;
  }
  if (create && /\bordin[ei]\b/i.test(request)) {
    const entity =
      w.entities.find(
        (e) => e.id === contextId && /ordin|order/i.test(e.name),
      ) || w.entities.find((e) => /orders|ordini/i.test(e.name));
    if (!entity) {
      proposal.builder = true;
      proposal.questions.push(
        "Manca un modulo ordini: configura lo schema nel Builder.",
      );
      return proposal;
    }
    const customerName = request
      .match(/client[ei]\s+([^:\n,]+)(?=[:\n,]|$)/i)?.[1]
      ?.trim();
    const customerField = entity.fields.find(
      (f) => f.type === "relation" && f.relationEntityId === "companies",
    );
    const itemField = entity.fields.find((f) =>
        /^(item|description|prodotto|descrizione)$/.test(f.id),
      ),
      units = entity.fields.find((f) =>
        /^(units|quantity|quantita)$/.test(f.id),
      ),
      price = entity.fields.find((f) =>
        /^(unitPrice|prezzoUnitario)$/.test(f.id),
      ),
      total = entity.fields.find(
        (f) => f.type === "currency" && !/unit/i.test(f.id),
      );
    const lines = [
      ...request.matchAll(
        /(\d+(?:[.,]\d+)?)\s+([^,;:\n]+?)\s+a\s+([\d.,]+)\s*(?:euro|€)/gi,
      ),
    ];
    if (!customerField || !itemField || !units || !price || !total) {
      proposal.builder = true;
      proposal.questions.push(
        "Lo schema ordini deve rappresentare cliente, descrizione, quantità, prezzo unitario e totale. Apri il Builder.",
      );
      return proposal;
    }
    if (!customerName)
      proposal.questions.push("Indica il cliente degli ordini.");
    if (!lines.length)
      proposal.questions.push(
        "Indica quantità, descrizione e prezzo per ogni ordine (es. 20 sedie a 150 euro).",
      );
    if (proposal.questions.length) return proposal;
    const customer = company(customerName!, "Cliente");
    if (
      customer &&
      companies?.records.some(
        (r) => r.id === customer.id && r.partyRole !== customer.partyRole,
      )
    )
      add(companies, customer, "update");
    for (const line of lines) {
      const quantity = parseItalianNumber(line[1]),
        unitPrice = parseItalianNumber(line[3]);
      if (
        quantity == null ||
        unitPrice == null ||
        quantity <= 0 ||
        unitPrice < 0
      ) {
        proposal.questions.push("Quantità o prezzo non validi.");
        continue;
      }
      add(entity, {
        id: newId("order"),
        [customerField.id]: customer?.id || "",
        [itemField.id]: line[2].replace(/^e\s+/i, "").trim(),
        [units.id]: quantity,
        [price.id]: unitPrice,
        [total.id]: Math.round(quantity * unitPrice * 100) / 100,
      });
    }
  } else if (/\b(sposta|aggiorna|cambiato|cambia|modifica)\b/i.test(request)) {
    if (/indirizzo/i.test(request) && companies && sites) {
      const name = request.match(
        /client[ei]\s+(.+?)\s+(?:ha|cambia|modifica)/i,
      )?.[1];
      if (!name) {
        proposal.questions.push("Indica l’azienda da aggiornare.");
        return proposal;
      }
      const target = resolve(companies, name);
      if (!target) {
        if (!proposal.questions.length)
          proposal.questions.push(
            `Azienda “${name}” non trovata. Cerca o crea prima l’anagrafica.`,
          );
        return proposal;
      }
      const address = request.split(":").slice(1).join(":").trim();
      if (!address) {
        proposal.questions.push("Indica il nuovo indirizzo.");
        return proposal;
      }
      const existing = sites.records.filter((r) => r.company === target.id);
      const main = existing.filter((r) => r.primary);
      if (existing.length > 1 && main.length !== 1) {
        proposal.questions.push(
          "L’azienda ha più sedi senza una principale univoca: seleziona la sede da aggiornare.",
        );
        for (const site of existing) add(sites, { ...site }, "update");
        return proposal;
      }
      const selected = main[0] || existing[0];
      const [street, city] = address
        .replace(/[.!?]$/, "")
        .split(",")
        .map((s) => s.trim());
      add(
        sites,
        {
          ...(selected || {
            id: newId("site"),
            company: target.id,
            name: "Indirizzo",
          }),
          address: street,
          ...(city ? { city } : {}),
        },
        selected ? "update" : "create",
      );
    } else {
      const ref = request.match(/\bORD-[\w-]+/i)?.[0],
        entity = w.entities.find((e) =>
          e.records.some((r) =>
            [r.id, r.orderNo].some((v) => norm(v) === norm(ref)),
          ),
        );
      if (!ref || !entity) {
        proposal.questions.push(
          "Indica un ordine esistente con riferimento univoco.",
        );
        return proposal;
      }
      const record = resolve(entity, ref),
        field = entity.fields.find(
          (f) =>
            f.type === "date" && /delivery|consegna|eta/i.test(f.id + f.name),
        ),
        date = absoluteDate(request, now);
      if (!field) {
        proposal.builder = true;
        proposal.questions.push("Manca un campo data consegna nello schema.");
      } else if (!date)
        proposal.questions.push(
          "Indica una data valida o un giorno della settimana.",
        );
      else if (record) add(entity, { ...record, [field.id]: date }, "update");
    }
  } else if (
    create &&
    (/^\s*(?:crea|aggiungi|inserisci|registra)\s+(?:(?:un|una|il|la|nuovo|nuova)\s+)*(?:attivit[aà]|task|progett[oi]|lead|contatt[oi]|sede|sedi)(?=\s|$|[,;])/i.test(
      request,
    ) ||
      (contextId && target !== "other" &&
        !["companies", "company-sites", "company-contacts"].includes(
          contextId,
        ) &&
        !/^\s*(?:crea|aggiungi|inserisci|registra)\s+(?:(?:il|la|un|una)\s+)?(?:fornitore|cliente|azienda)\b/i.test(
          request,
        )))
  ) {
    const hint =
      request.match(
        /\b(attivit[aà]|task|progett[oi]|lead|contatt[oi]|sede|sedi)(?=\s|$|[,;])/i,
      )?.[1] || "";
    const entity =
      (hint ? w.entities.find((e) =>
        /task|attivit/i.test(hint)
          ? /task|attivit/i.test(e.name)
          : /progett/i.test(hint)
            ? /project|progett/i.test(e.name)
            : /lead/i.test(hint)
              ? /lead/i.test(e.name)
              : /contatt/i.test(hint)
                ? e.id === "company-contacts"
                : e.id === "company-sites",
      ) : w.entities.find((e) => e.id === contextId));
    if (!entity) {
      proposal.builder = true;
      proposal.questions.push(
        "Il modulo richiesto non è disponibile. Apri il Builder.",
      );
      return proposal;
    }
    const record: DataRecord = { id: newId("record") },
      nameField =
        entity.fields.find((f) => f.id === "name") ||
        entity.fields.find((f) => f.type === "text");
    const title = request
      .replace(/^.*?\b(?:attivit[aà]|task|progetto|lead|contatto|sede)\s+/i, "")
      .split(/[,;\n]/)[0]
      .trim();
    if (nameField && title) record[nameField.id] = title;
    for (const field of entity.fields) {
      const escaped = field.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        value = request
          .match(
            new RegExp(`(?:${escaped}|${field.id})\\s*:\\s*([^;\\n]+)`, "i"),
          )?.[1]
          ?.trim();
      if (value) {
        if (field.type === "relation") {
          const target = w.entities.find(
              (e) => e.id === field.relationEntityId,
            ),
            match = target && resolve(target, value);
          if (match) record[field.id] = match.id;
          else proposal.questions.push(`Scegli il collegamento ${field.name}.`);
        } else
          record[field.id] = ["number", "currency"].includes(field.type)
            ? parseItalianNumber(value)
            : field.type === "date"
              ? absoluteDate(value, now)
              : field.type === "checkbox"
                ? /^(sì|si|true|yes)$/i.test(value)
                : value;
      }
    }
    const dateField = entity.fields.find((f) => f.type === "date");
    if (
      dateField &&
      /scadenza|entro|domani|oggi|lunedì|martedì|mercoledì|giovedì|venerdì/i.test(
        request,
      )
    ) {
      const date = absoluteDate(request, now);
      if (date) record[dateField.id] = date;
    }
    add(entity, record);
  } else if (create && companies && (target === "company" || target === null && (contextId === "companies" || /\b(?:s\.?r\.?l\.?|s\.?p\.?a\.?|ltd|inc)\b|p\.?\s*iva|partita\s+iva/i.test(request)))) {
    const name = request
      .match(
        /(?:aggiungi|crea|inserisci|registra|add|create)\s+(?:(?:(?:il|la|un|una|nuovo|nuova)\s+)|un['’])*(?:(?:fornitore|cliente|azienda)\s+)?([^,;\n]+)/i,
      )?.[1]
      ?.trim();
    if (!name) {
      proposal.questions.push("Indica la ragione sociale.");
      return proposal;
    }
    const target = company(name, supplier ? "Fornitore" : "Cliente");
    if (!target) return proposal;
    const vat = request.match(
        /(?:p\.?\s*iva|partita\s+iva)\s*[:.]?\s*([A-Z]{0,2}[\dA-Z]{5,20})/i,
      )?.[1],
      email = request.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0];
    const existing = companies.records.some((r) => r.id === target.id);
    if (existing)
      add(companies, { ...target, ...(vat ? { vat } : {}) }, "update");
    else if (vat) target.vat = vat;
    const city = request.match(
      /sede\s+(legale|amministrativa|operativa|magazzino|consegna)\s+a\s+([^,;\n]+)/i,
    );
    let site: DataRecord | undefined;
    if (city && sites) {
      site = {
        id: newId("site"),
        company: target.id,
        name: `Sede ${city[1]}`,
        kind: city[1],
        city: city[2].trim(),
      };
      add(sites, site);
    }
    const person = request.match(
      /referente\s+(?:(acquisti|amministrazione|logistica|commerciale|direzione)\s+)?([^,;\n]+)/i,
    );
    if (person && contacts) {
      const names = person[2].trim().split(/\s+/);
      add(contacts, {
        id: newId("contact"),
        company: target.id,
        name: names[0],
        surname: names.slice(1).join(" "),
        ...(person[1]
          ? { department: person[1], role: `Referente ${person[1]}` }
          : {}),
        ...(email ? { email } : {}),
        ...(site ? { site: site.id } : {}),
      });
    } else if (email) {
      const op = proposal.operations.find(
        (o) => o.entityId === companies.id && o.record.id === target.id,
      );
      if (op && companies.fields.some((f) => f.id === "email"))
        op.record.email = email;
      else
        proposal.questions.push(
          "Specifica il nome del contatto a cui associare l’email.",
        );
    }
  } else {
    proposal.questions.push(
      "Interprete locale: descrivi creazione aziende/contatti/sedi, ordini con quantità e prezzi o aggiornamento indirizzo/data. Per altri campi usa la preview manuale o il Builder.",
    );
    proposal.builder = true;
  }
  return proposal;
}

export function applyEntry(
  w: Workspace,
  input: unknown,
  deferWorkflows = false,
): Workspace {
  requirePermission(w, "editRecords");
  const p = entrySchema.parse(input);
  if (!entryMatchesIntent(p, w)) throw new DomainError("La proposta non corrisponde al modulo richiesto. Rigenerala: una proprietà non può essere salvata come azienda.");
  if (w.appliedEntries?.includes(p.id)) return w;
  if (p.baseRevision !== (w.revision || 0))
    throw new DomainError(
      "Il workspace è cambiato: rigenera la proposta prima di confermare.",
    );
  if (p.questions.length || p.builder || !p.operations.length)
    throw new DomainError(
      "Risolvi le informazioni mancanti prima della conferma.",
    );
  if (
    new Set(p.operations.map((op) => `${op.entityId}:${op.record.id}`)).size !==
    p.operations.length
  )
    throw new DomainError(
      "La proposta contiene lo stesso record più di una volta.",
    );
  let next = structuredClone(w);
  for (const op of p.operations) {
    const entity = next.entities.find((e) => e.id === op.entityId);
    if (!entity) throw new DomainError("Modulo non disponibile.");
    const record = op.record as DataRecord;
    if (op.kind === "create" && isPropertyEntity(entity) && !entity.fields.filter(f => /^(reference|riferimento|address|indirizzo|name|nome|title|titolo|codice)$/.test(f.id)).some(f => String(record[f.id] || "").trim())) throw new DomainError("Indica il riferimento o l’indirizzo della proprietà prima di confermare.");
    const previous = entity.records.find((r) => r.id === record.id);
    if (
      entity.fields.some((f) => f.id === "value" && f.type === "currency") &&
      typeof record.units === "number" &&
      typeof record.unitPrice === "number" &&
      record.value !== Math.round(record.units * record.unitPrice * 100) / 100
    )
      throw new DomainError(
        "Il totale deve corrispondere a quantità × prezzo unitario.",
      );
    if (
      Object.keys(record).some(
        (key) =>
          !["id", "assigneeId", ...entity.fields.map((f) => f.id)].includes(
            key,
          ) &&
          (!previous || previous[key] !== record[key]),
      )
    )
      throw new DomainError(
        "La proposta contiene campi non rappresentabili: apri il Builder.",
      );
    if (
      (op.kind === "update" && !previous) ||
      (op.kind === "create" && previous)
    )
      throw new DomainError("Il record da aggiornare o creare non è valido.");
    if (
      op.kind === "create" &&
      entity.records.some((r) =>
        Object.entries(record)
          .filter(([key]) => key !== "id")
          .every(([key, v]) => norm(r[key]) === norm(v)),
      )
    )
      throw new DomainError("Possibile duplicato: il record esiste già.");
    const errors = validateRecord(next, entity, record);
    if (Object.keys(errors).length)
      throw new DomainError(Object.values(errors).join(" "));
    next = saveRecord(next, entity.id, record, "ai", deferWorkflows);
  }
  next.appliedEntries = [...(w.appliedEntries || []), p.id].slice(-500);
  return next;
}
