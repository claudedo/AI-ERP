import { useEffect, useState, type KeyboardEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Database,
  GitBranch,
} from "lucide-react";
import type { Analysis, ArchitectureOption } from "../types";
import { NodusLogo } from "../components/NodusLogo";
import { templateModuleLabel } from "../services/realEstateLabels";

// Each example must match exactly one sector profile in aiEngine (Italian terms).
const examples = {
  "Azienda di moda":
    "Siamo un'azienda di moda che crea due collezioni l'anno. Gestiamo prodotti, fornitori, produzione, ordini wholesale e consegne, soprattutto su fogli di calcolo.",
  "Agenzia immobiliare":
    "Siamo un'agenzia immobiliare. Gestiamo immobili, proprietari, potenziali clienti, appuntamenti, offerte e contratti su strumenti diversi e scollegati.",
  "Società di consulenza":
    "Siamo una società di consulenza con 30 persone. Gestiamo clienti, opportunità, progetti, attività, timesheet e fatturazione.",
};
const analysisSteps = [
  "Comprensione dell'attività",
  "Mappatura dei processi",
  "Individuazione delle entità",
  "Progettazione dei flussi",
  "Ricerca di automazioni possibili",
];
const buildSteps = [
  "Creazione del modello dati",
  "Creazione delle relazioni",
  "Generazione delle viste",
  "Costruzione della dashboard",
  "Configurazione dei flussi",
  "Impostazione dei permessi",
];

export function Builder({
  stage,
  analysis,
  options,
  selected,
  automation,
  onAutomationChange,
  onSubmit,
  onSelect,
  onContinue,
  onBuild,
  onBack,
  onBackToLanding,
  onBackToArchitect,
  description,
  onDescriptionChange: setDescription,
  sector,
  onSectorChange,
  onRestart,
  persistenceError,
}: {
  stage: string;
  analysis: Analysis | null;
  options: ArchitectureOption[];
  selected: ArchitectureOption | null;
  automation: boolean;
  onAutomationChange: (enabled: boolean) => void;
  onSubmit: (v: string) => void;
  onSelect: (v: ArchitectureOption) => void;
  onContinue: () => void;
  onBuild: () => void;
  onBack: () => void;
  onBackToLanding: () => void;
  onBackToArchitect: () => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  sector: string;
  onSectorChange: (value: string) => void;
  onRestart: () => void;
  persistenceError: string;
}) {
  const [progress, setProgress] = useState(0);
  const steps: { label: string; state: "done" | "active" | "" }[] = [
    { label: "Scopri", state: stage === "discovery" ? "active" : "done" },
    {
      label: "Progetta",
      state:
        stage === "building"
          ? "done"
          : ["architect", "suggestions"].includes(stage)
            ? "active"
            : "",
    },
    { label: "Crea", state: stage === "building" ? "active" : "" },
  ];
  const selectedIndex = options.findIndex((o) => o.id === selected?.id);
  const onOptionKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!delta || !options.length) return;
    event.preventDefault();
    const next = (index + delta + options.length) % options.length;
    onSelect(options[next]);
    const group = event.currentTarget.parentElement;
    (group?.children[next] as HTMLElement | undefined)?.focus();
  };
  const recommendation =
    analysis?.industry === "consulting"
      ? "Notifica il team quando cambia lo stato di un progetto"
      : analysis?.industry === "realestate"
        ? "Notifica il team quando cambia lo stato di un’offerta"
        : "Notifica il team quando cambia lo stato di un ordine";
  useEffect(() => {
    if (!["analysis", "building"].includes(stage)) return;
    setProgress(0);
    const timer = window.setInterval(
      () =>
        setProgress((p) => (p < (stage === "analysis" ? 4 : 5) ? p + 1 : p)),
      520,
    );
    return () => clearInterval(timer);
  }, [stage]);
  return (
    <main className="builder-shell">
      <header className="builder-header">
        <div className="brand">
          <NodusLogo variant="lockup" />
        </div>
        <ol className="builder-progress" aria-label="Avanzamento">
          {steps.map((step) => (
            <li
              key={step.label}
              className={step.state}
              aria-current={step.state === "active" ? "step" : undefined}
            >
              {step.state === "done" && <Check size={13} aria-hidden="true" />}
              {step.label}
            </li>
          ))}
        </ol>
        <div className="onboarding-tools">
          <button className="restart-link" onClick={onRestart}>
            Ricomincia e cancella bozza
          </button>
        </div>
      </header>
      {persistenceError && (
        <p className="onboarding-alert" role="alert">
          {persistenceError}
        </p>
      )}
      {stage === "discovery" && (
        <section className="discovery panel-page">
          <div className="step-bar">
            <button className="back" onClick={onBackToLanding}>
              <ArrowLeft size={16} /> Indietro
            </button>
            <div className="ai-label">
              <span>
                <NodusLogo variant="mark" />
              </span>
              NODUS ARCHITECT
            </div>
          </div>
          <h1>Raccontami come funziona la tua azienda.</h1>
          <p>
            Descrivi il team, cosa gestite e dove il processo attuale si
            complica.
          </p>
          <textarea
            aria-label="Descrizione aziendale"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Siamo un mobilificio con 25 dipendenti. Gestiamo clienti, preventivi, ordini..."
          />
          <div className="example-row">
            <span>Prova un esempio</span>
            {Object.entries(examples).map(([k, v]) => (
              <button key={k} onClick={() => setDescription(v)}>
                {k}
              </button>
            ))}
          </div>
          {analysis?.needsConfirmation && (
            <label className="field">
              <span role="status">
                Il settore non è univoco. Conferma prima di continuare.
              </span>
              <select
                value={sector}
                onChange={(e) => onSectorChange(e.target.value)}
              >
                <option value="">Scegli il settore</option>
                <option value="consulting">Consulenza</option>
                <option value="fashion">Moda</option>
                <option value="realestate">Immobiliare</option>
                <option value="furniture">Arredamento / produzione</option>
                <option value="generic">Altro / generico</option>
              </select>
            </label>
          )}
          <button
            disabled={
              description.trim().length < 18 ||
              (!!analysis?.needsConfirmation && !sector)
            }
            className="primary continue"
            onClick={() => onSubmit(description)}
          >
            Analizza la mia azienda <ArrowRight size={17} />
          </button>
          <div className="privacy">
            La descrizione serve solo a configurare questo workspace demo. La
            bozza è conservata in questo browser.
          </div>
        </section>
      )}
      {stage === "analysis" && (
        <LoadingView
          title="Analisi della tua azienda"
          subtitle="NODUS Architect sta trasformando la descrizione in un modello operativo flessibile."
          steps={analysisSteps}
          progress={progress}
        />
      )}
      {stage === "architect" && analysis && (
        <section className="architecture panel-page wide">
          <div className="step-bar">
            <button className="back" onClick={onBack}>
              <ArrowLeft size={16} /> Modifica descrizione
            </button>
            <div className="ai-label">
              <span>
                <NodusLogo variant="mark" />
              </span>
              MAPPA DELL’AZIENDA
            </div>
          </div>
          <div className="split-title">
            <div>
              <h1>Tre modi per strutturare il tuo workspace.</h1>
              <p>
                Ogni modello supporta la stessa attività. Scegli il livello di
                dettaglio adatto al tuo team oggi.
              </p>
            </div>
            <ProcessMap analysis={analysis} />
          </div>
          <div
            className="option-grid"
            role="radiogroup"
            aria-label="Struttura del workspace"
          >
            {options.map((option, index) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected?.id === option.id}
                aria-labelledby={`architecture-${option.id}-title`}
                aria-describedby={`architecture-${option.id}-description`}
                tabIndex={
                  index === (selectedIndex < 0 ? 0 : selectedIndex) ? 0 : -1
                }
                className={`architecture-card ${selected?.id === option.id ? "selected" : ""}`}
                onClick={() => onSelect(option)}
                onKeyDown={(event) => onOptionKey(event, index)}
              >
                <div className="card-top">
                  <span>{option.label}</span>
                  {selected?.id === option.id && (
                    <i>
                      <Check size={14} />
                    </i>
                  )}
                </div>
                <h2 id={`architecture-${option.id}-title`}>{option.title}</h2>
                <p id={`architecture-${option.id}-description`}>{option.description}</p>
                <div className="module-list">
                  {option.modules.map((m) => (
                    <span key={m}>{templateModuleLabel(m)}</span>
                  ))}
                </div>
                <ul>
                  {option.advantages.map((a) => (
                    <li key={a}>
                      <Check size={14} />
                      {a}
                    </li>
                  ))}
                </ul>
                <div className="complexity">
                  <span>Complessità</span>
                  <div>
                    {[1, 2, 3].map((n) => (
                      <i
                        key={n}
                        className={n <= option.complexity ? "filled" : ""}
                      />
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </div>
          <button
            disabled={!selected}
            className="primary continue"
            onClick={onContinue}
          >
            Continua con {selected?.title || "la struttura scelta"}{" "}
            <ArrowRight size={17} />
          </button>
        </section>
      )}
      {stage === "suggestions" && (
        <section className="suggestions panel-page">
          <div className="step-bar">
            <button className="back" onClick={onBackToArchitect}>
              <ArrowLeft size={16} /> Architettura
            </button>
            <div className="ai-label">
              <span>
                <NodusLogo variant="mark" />
              </span>
              SUGGERIMENTI NODUS
            </div>
          </div>
          <h1>Due miglioramenti prima di creare il workspace.</h1>
          <p>
            Suggerimenti coerenti con i moduli scelti. Le automazioni della demo
            sono eseguite in questo browser.
          </p>
          <div className={`suggestion-card ${automation ? "" : "muted"}`}>
            <div className="suggestion-icon">
              <GitBranch />
            </div>
            <div>
              <span className="suggestion-type">Automazione locale</span>
              <h2>{recommendation}</h2>
              <p>
                La notifica interna sarà creata solo quando cambierà un record
                pertinente.
              </p>
            </div>
            <button
              type="button"
              className="suggestion-toggle"
              aria-pressed={automation}
              onClick={() => onAutomationChange(!automation)}
            >
              <span className="toggle-box" aria-hidden="true">
                {automation && <Check size={13} />}
              </span>
              {automation ? "Aggiunta" : "Aggiungi automazione"}
            </button>
          </div>
          <div className="suggestion-card">
            <div className="suggestion-icon">
              <Database />
            </div>
            <div>
              <span className="suggestion-type">Struttura dati consigliata</span>
              <h2>Aziende, contatti e sedi separati</h2>
              <p>
                Una sola azienda può essere cliente e fornitore, con più
                contatti e sedi collegati.
              </p>
            </div>
            <span className="suggestion-tag">Consigliato</span>
          </div>
          <button className="primary continue" onClick={onBuild}>
            Crea il mio workspace <ArrowRight size={17} />
          </button>
        </section>
      )}
      {stage === "building" && (
        <LoadingView
          title="Creazione del workspace"
          subtitle="Sto trasformando l’architettura scelta in un gestionale funzionante."
          steps={buildSteps}
          progress={progress}
        />
      )}
    </main>
  );
}

function LoadingView({
  title,
  subtitle,
  steps,
  progress,
}: {
  title: string;
  subtitle: string;
  steps: string[];
  progress: number;
}) {
  return (
    <section className="loading-view" role="status" aria-live="polite">
      <div className="loader-orbit" aria-hidden="true">
        <NodusLogo variant="mark" />
        <i />
        <i />
        <i />
      </div>
      <h1>
        {title}
        <span className="ellipsis">…</span>
      </h1>
      <p>{subtitle}</p>
      <div className="steps">
        {steps.map((s, i) => (
          <div
            className={
              i < progress ? "complete" : i === progress ? "current" : ""
            }
            aria-current={i === progress ? "step" : undefined}
            key={s}
          >
            <span>{i < progress ? <Check size={14} /> : i + 1}</span>
            {s}
          </div>
        ))}
      </div>
    </section>
  );
}
function ProcessMap({ analysis }: { analysis: Analysis }) {
  return (
    <div className="process-map">
      <div className="map-chain">
        {analysis.process.map((p, i) => (
          <div key={p}>
            <span>{templateModuleLabel(p)}</span>
            {i < analysis.process.length - 1 && <ChevronDown size={14} />}
          </div>
        ))}
      </div>
      <div className="map-branches">
        <GitBranch size={16} />
        {analysis.branches.map((b) => (
          <span key={b}>{templateModuleLabel(b)}</span>
        ))}
      </div>
    </div>
  );
}
