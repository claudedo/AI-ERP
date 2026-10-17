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

const examples = {
  "Fashion company":
    "We are a fashion company creating two collections per year. We manage products, suppliers, production, wholesale orders and deliveries, mostly in spreadsheets.",
  "Real estate agency":
    "We are a real estate agency. We manage properties, owners, leads, appointments, offers and contracts across several disconnected tools.",
  "Consulting company":
    "We are a consulting company with 30 people. We manage clients, opportunities, projects, tasks, timesheets and billing.",
};
const analysisSteps = [
  "Understanding your business",
  "Mapping processes",
  "Identifying entities",
  "Designing workflows",
  "Finding automation opportunities",
];
const buildSteps = [
  "Creating data model",
  "Creating relationships",
  "Generating views",
  "Building dashboard",
  "Configuring workflows",
  "Setting permissions",
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
            01 Discover
          </span>
          <i />
          <span
            className={
              ["architect", "suggestions", "building"].includes(stage)
                ? "active"
                : ""
            }
          >
            02 Design
          </span>
          <i />
          <span className={stage === "building" ? "active" : ""}>03 Build</span>
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
            <ArrowLeft size={16} /> Back
          </button>
          <div className="ai-label">
            <span>
              <NodusLogo variant="mark" />
            </span>
            NODUS ARCHITECT
          </div>
          <h2>Tell me how your company works.</h2>
          <p>
            Describe your team, what you manage, and where your current process
            gets difficult.
          </p>
          <textarea
            aria-label="Descrizione aziendale"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="We are a furniture company with 25 employees. We manage customers, quotes, orders..."
          />
          <div className="example-row">
            <span>Try an example</span>
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
            Analyze my business <ArrowRight size={17} />
          </button>
          <div className="privacy">
            Your description is used only to configure this demo workspace. La
            bozza è conservata in questo browser.
          </div>
        </section>
      )}
      {stage === "analysis" && (
        <LoadingView
          title="Understanding your business"
          subtitle="The architect is mapping your company into a flexible operating model."
          steps={analysisSteps}
          progress={progress}
        />
      )}
      {stage === "architect" && analysis && (
        <section className="architecture panel-page wide">
          <button className="back" onClick={onBack}>
            <ArrowLeft size={16} /> Edit description
          </button>
          <div className="split-title">
            <div>
              <div className="ai-label">
                <span>
                  <NodusLogo variant="mark" />
                </span>
                BUSINESS MAP
              </div>
              <h2>Three ways to structure your workspace.</h2>
              <p>
                Each model supports the same business. Choose the level of
                detail that fits your team today.
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
                    <span key={m}>{m}</span>
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
                  <span>Complexity</span>
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
            Continue with {selected?.title || "selected structure"}{" "}
            <ArrowRight size={17} />
          </button>
        </section>
      )}
      {stage === "suggestions" && (
        <section className="suggestions panel-page">
          <button className="back" onClick={onBackToArchitect}>
            <ArrowLeft size={16} /> Architecture
          </button>
          <div className="ai-label">
            <span>
              <NodusLogo variant="mark" />
            </span>
            NODUS RECOMMENDATIONS
          </div>
          <h2>Two improvements before we build.</h2>
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
                  <Check size={15} /> Added
                </>
              ) : (
                "Add automation"
              )}
            </button>
          </div>
          <div className="suggestion-card">
            <div className="suggestion-icon">
              <Database />
            </div>
            <div>
              <span className="suggestion-type">Data structure suggestion</span>
              <h3>Separate companies, contacts and locations</h3>
              <p>
                Una sola azienda può essere cliente e fornitore, con più
                contatti e sedi collegati.
              </p>
            </div>
            <span className="added">
              <Check size={15} /> Recommended
            </span>
          </div>
          <button className="primary continue" onClick={onBuild}>
            Build my workspace <ArrowRight size={17} />
          </button>
        </section>
      )}
      {stage === "building" && (
        <LoadingView
          title="Building your workspace"
          subtitle="Turning the selected architecture into a working management system."
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
            <span>{p}</span>
            {i < analysis.process.length - 1 && <ChevronDown size={14} />}
          </div>
        ))}
      </div>
      <div className="map-branches">
        <GitBranch size={16} />
        {analysis.branches.map((b) => (
          <span key={b}>{b}</span>
        ))}
      </div>
    </div>
  );
}
