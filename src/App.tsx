import { useEffect, useState } from "react";
import { loadOnboarding, ONBOARDING_KEY } from "./services/onboarding";
import { upgradeCompanies } from "./services/companies";
import { routeTo } from "./hooks/useWorkspaceRoute";
import {
  analyzeBusiness,
  generateArchitectureOptions,
  generateWorkspace,
} from "./services/aiEngine";
import { useWorkspace } from "./hooks/useWorkspace";
import type { Analysis, ArchitectureOption } from "./types";
import { Landing } from "./pages/Landing";
import { Builder } from "./pages/Builder";
import { WorkspaceApp } from "./pages/WorkspaceApp";
import { downloadText } from "./services/importExport";
import { localWorkspaceRepository } from "./services/workspaceStorage";
import { VisualBuilder } from "./builder/VisualBuilder";
import { dispatchWorkspaceAction } from "./services/workspaceActions";
import { ConnectedWorkspace } from "./pages/ConnectedWorkspace";

type Stage =
  | "landing"
  | "discovery"
  | "analysis"
  | "architect"
  | "suggestions"
  | "building"
  | "workspace";
export default function App() {
  const { workspace, setWorkspace, reset, storageError } = useWorkspace();
  const [initialDraft] = useState(loadOnboarding);
  const [description, setDescription] = useState(initialDraft.description);
  const [sector, setSector] = useState(initialDraft.sector);
  const [onboardingError, setOnboardingError] = useState("");
  const [stage, setStage] = useState<Stage>(
    workspace ? "workspace" : (initialDraft.stage as Stage),
  );
  const [analysis, setAnalysis] = useState<Analysis | null>(
    initialDraft.analysis,
  );
  const [selected, setSelected] = useState<ArchitectureOption | null>(
    initialDraft.selected,
  );
  const [automation, setAutomation] = useState(initialDraft.automation);
  const [visualBuilder, setVisualBuilder] = useState(
    location.hash === "#builder",
  );
  const [connected, setConnected] = useState(
    () =>
      location.hash === "#connected" ||
      new URLSearchParams(location.search).get("mode") === "connected",
  );
  useEffect(() => {
    const update = () => {
      setVisualBuilder(location.hash === "#builder");
      setConnected(location.hash === "#connected");
      if (workspace) setStage("workspace");
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, [workspace]);
  useEffect(() => {
    if (!workspace) {
      try {
        localStorage.setItem(
          ONBOARDING_KEY,
          JSON.stringify({
            version: 1,
            description,
            analysis,
            selected,
            automation,
            stage,
            sector,
          }),
        );
        setOnboardingError("");
      } catch {
        setOnboardingError(
          "Bozza non salvata: spazio browser insufficiente. Non chiudere questa pagina.",
        );
      }
    }
  }, [workspace, description, analysis, selected, automation, stage, sector]);
  const restart = () => {
    localStorage.removeItem(ONBOARDING_KEY);
    setDescription("");
    setSector("");
    setAnalysis(null);
    setSelected(null);
    setAutomation(true);
    setStage("discovery");
  };

  const begin = (description: string) => {
    const result = analyzeBusiness(description, sector || undefined);
    setAnalysis(result);
    setSelected(null);
    if (result.needsConfirmation) return;
    setStage("analysis");
    window.setTimeout(() => setStage("architect"), 3400);
  };
  const build = () => {
    if (!analysis || !selected) return;
    setStage("building");
    window.setTimeout(() => {
      const next = generateWorkspace(analysis, selected);
      next.workflows = [];
      const source = next.entities.find(
        (e) =>
          /projects|offers|orders/i.test(e.name) &&
          e.fields.some((f) => f.id === "status"),
      );
      if (automation && source)
        next.workflows.push({
          id: "onboarding-status-notification",
          name: `Notifica stato · ${source.name}`,
          trigger: `${source.name}: status changed`,
          actions: ["Notifica interna"],
          active: true,
          runs: [],
          config: {
            entityId: source.id,
            event: "status",
            fieldId: "status",
            action: "notify",
          },
        });
      if (setWorkspace(upgradeCompanies(next))) {
        localStorage.removeItem(ONBOARDING_KEY);
        setStage("workspace");
        routeTo("workspace/dashboard");
      }
    }, 3300);
  };
  if (connected)
    return (
      <ConnectedWorkspace
        onClose={() => {
          history.replaceState(null, "", location.pathname);
          setConnected(false);
          routeTo(workspace ? "workspace/dashboard" : "landing");
        }}
      />
    );
  if (storageError && !workspace)
    return (
      <main className="panel-page storage-recovery" role="alert">
        <h2>Workspace needs recovery</h2>
        <p>{storageError}</p>
        <p>
          Your saved data has not been silently reset. Download the raw copy
          before choosing to clear this browser’s demo workspace.
        </p>
        <div>
          <button
            className="secondary"
            onClick={() => {
              const raw = localWorkspaceRepository.raw();
              if (raw)
                downloadText(
                  raw,
                  "nodus-workspace-recovery.json",
                  "application/json",
                );
            }}
            disabled={!localWorkspaceRepository.raw()}
          >
            Download saved data
          </button>
          <button
            className="danger-solid"
            onClick={() => {
              reset();
              setStage("landing");
            }}
          >
            Reset local demo
          </button>
        </div>
      </main>
    );
  if (stage === "landing")
    return (
      <>
        <Landing onStart={() => setStage("discovery")} />
        <button
          className="secondary connected-entry"
          onClick={() => {
            setConnected(true);
            routeTo("connected");
          }}
        >
          Connected workspace
        </button>
      </>
    );
  if (stage === "workspace" && workspace && visualBuilder)
    return (
      <VisualBuilder
        workspace={workspace}
        onAction={(action) =>
          setWorkspace(dispatchWorkspaceAction(workspace, action))
        }
        onClose={() => {
          setVisualBuilder(false);
          routeTo("workspace/dashboard");
        }}
      />
    );
  if (stage === "workspace" && workspace)
    return (
      <WorkspaceApp
        workspace={workspace}
        setWorkspace={setWorkspace}
        storageError={storageError}
        onBuilder={() => {
          setVisualBuilder(true);
          routeTo("builder");
        }}
        onConnected={() => {
          setConnected(true);
          routeTo("connected");
        }}
        onReset={() => {
          reset();
          localStorage.removeItem(ONBOARDING_KEY);
          routeTo("landing");
          setStage("landing");
        }}
      />
    );
  return (
    <Builder
      stage={stage}
      description={description}
      onDescriptionChange={(value) => {
        setDescription(value);
        setSector("");
        setAnalysis(null);
        setSelected(null);
      }}
      sector={sector}
      onSectorChange={setSector}
      onRestart={restart}
      persistenceError={onboardingError}
      analysis={analysis}
      options={analysis ? generateArchitectureOptions(analysis) : []}
      selected={selected}
      automation={automation}
      onAutomationChange={setAutomation}
      onSubmit={begin}
      onSelect={setSelected}
      onContinue={() => setStage("suggestions")}
      onBuild={build}
      onBack={() => setStage("discovery")}
      onBackToLanding={() => setStage("landing")}
      onBackToArchitect={() => setStage("architect")}
    />
  );
}
