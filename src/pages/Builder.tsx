import { useEffect, useState } from "react";
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
        <div className="builder-progress">
          <span className={stage !== "discovery" ? "done" : "active"}>
            01 Scopri
          </span>
          <i />
          <span
            className={
              ["architect", "suggestions", "building"].includes(stage)
                ? "active"
                : ""
            }
          >
            02 Progetta
          </span>
          <i />
          <span className={stage === "building" ? "active" : ""}>03 Crea</span>
        </div>
        <div />
      </header>
      <div className="onboarding-tools">
        <button className="text-button" onClick={onRestart}>
          Ricomincia e cancella bozza
        </button>
        {persistenceError && <p role="alert">{persistenceError}</p>}
      </div>
      {stage === "discovery" && (
        <section className="discovery panel-page">
          <button className="back" onClick={onBackToLanding}>
            <ArrowLeft size={16} /> Indietro
          </button>
          <div className="ai-label">
            <span>
              <NodusLogo variant="mark" />
            </span>
            NODUS ARCHITECT
          </div>
          <h2>Raccontami come funziona la tua azienda.</h2>
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
          <button className="back" onClick={onBack}>
            <ArrowLeft size={16} /> Modifica descrizione
          </button>
          <div className="split-title">
            <div>
              <div className="ai-label">
                <span>
                  <NodusLogo variant="mark" />
                </span>
                MAPPA DELL’AZIENDA
              </div>
              <h2>Tre modi per strutturare il tuo workspace.</h2>
              <p>
                Ogni modello supporta la stessa attività. Scegli il livello di
                dettaglio adatto al tuo team oggi.
              </p>
            </div>
            <ProcessMap analysis={analysis} />
          </div>
          <div className="option-grid">
            {options.map((option) => (
              <button
                key={option.id}
                className={`architecture-card ${selected?.id === option.id ? "selected" : ""}`}
                onClick={() => onSelect(option)}
              >
                <div className="card-top">
                  <span>{option.label}</span>
                  {selected?.id === option.id && (
                    <i>
                      <Check size={14} />
                    </i>
                  )}
                </div>
                <h3>{option.title}</h3>
                <p>{option.description}</p>
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
          <button className="back" onClick={onBackToArchitect}>
            <ArrowLeft size={16} /> Architettura
          </button>
          <div className="ai-label">
            <span>
              <NodusLogo variant="mark" />
            </span>
            SUGGERIMENTI NODUS
          </div>
          <h2>Due miglioramenti prima di creare il workspace.</h2>
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
              <h3>{recommendation}</h3>
              <p>
                La notifica interna sarà creata solo quando cambierà un record
                pertinente.
              </p>
            </div>
            <button
              className={automation ? "added" : "secondary"}
              onClick={() => onAutomationChange(!automation)}
            >
              {automation ? (
                <>
                  <Check size={15} /> Aggiunta
                </>
              ) : (
                "Aggiungi automazione"
              )}
            </button>
          </div>
          <div className="suggestion-card">
            <div className="suggestion-icon">
              <Database />
            </div>
            <div>
              <span className="suggestion-type">Struttura dati consigliata</span>
              <h3>Aziende, contatti e sedi separati</h3>
              <p>
                Una sola azienda può essere cliente e fornitore, con più
                contatti e sedi collegati.
              </p>
            </div>
            <span className="added">
              <Check size={15} /> Consigliato
            </span>
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
      <h2>
        {title}
        <span className="ellipsis">…</span>
      </h2>
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
