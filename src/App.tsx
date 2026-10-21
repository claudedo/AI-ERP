import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { NavigationGuardProvider } from "./components/ui/NavigationGuard";
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
import { downloadText } from "./services/importExport";
import { localWorkspaceRepository } from "./services/workspaceStorage";
import { dispatchWorkspaceAction } from "./services/workspaceActions";
import { isModuleKind } from "./services/moduleKinds";
const Builder = lazy(() => import("./pages/Builder").then(module => ({ default: module.Builder })));
const WorkspaceApp = lazy(() => import("./pages/WorkspaceApp").then(module => ({ default: module.WorkspaceApp })));
const VisualBuilder = lazy(() => import("./builder/VisualBuilder").then(module => ({ default: module.VisualBuilder })));
const ConnectedWorkspace = lazy(() => import("./pages/ConnectedWorkspace").then(module => ({ default: module.ConnectedWorkspace })));

type Stage =
  | "landing"
  | "discovery"
  | "analysis"
  | "architect"
  | "suggestions"
  | "building"
  | "workspace";
export default function App() {
  return <NavigationGuardProvider><Suspense fallback={<main className="app-loading" role="status" aria-live="polite">Caricamento di NODUS…</main>}><Application /></Suspense></NavigationGuardProvider>;
}

function Application() {
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
  const transition = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const cancelTransition = () => {
    generation.current++;
    if (transition.current !== null) window.clearTimeout(transition.current);
    transition.current = null;
  };
  const leaveStep = (next: Stage) => { cancelTransition(); setStage(next); };
  useEffect(() => () => cancelTransition(), []);
  useEffect(() => {
    const update = () => {
      // Only a workspace route supersedes onboarding; otherwise a pending
      // analysis/build timer must still advance the loading stage.
      if (workspace) cancelTransition();
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
    cancelTransition();
    localStorage.removeItem(ONBOARDING_KEY);
    setDescription("");
    setSector("");
    setAnalysis(null);
    setSelected(null);
    setAutomation(true);
    setStage("discovery");
  };

  const begin = (description: string) => {
    cancelTransition();
    const result = analyzeBusiness(description, sector || undefined);
    setAnalysis(result);
    setSelected(null);
    if (result.needsConfirmation) return;
    setStage("analysis");
    const token = generation.current;
    transition.current = window.setTimeout(() => { if (token === generation.current) setStage("architect"); }, 3400);
  };
  const build = () => {
    if (!analysis || !selected) return;
    cancelTransition();
    const token = generation.current;
    setStage("building");
    transition.current = window.setTimeout(() => {
      if (token !== generation.current) return;
      const next = generateWorkspace(analysis, selected);
      next.workflows = [];
      const source = next.entities.find(
        (e) =>
          (isModuleKind(e, "projects") || isModuleKind(e, "offers") || isModuleKind(e, "orders")) &&
          e.fields.some((f) => f.id === "status"),
      );
      if (automation && source)
        next.workflows.push({
          id: "onboarding-status-notification",
          name: `Notifica stato · ${source.name}`,
          trigger: `${source.name}: cambio di stato`,
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
      <Landing
        onStart={() => leaveStep("discovery")}
        onOpenConnected={() => {
          cancelTransition();
          setConnected(true);
          routeTo("connected");
        }}
      />
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
        cancelTransition();
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
      onContinue={() => leaveStep("suggestions")}
      onBuild={build}
      onBack={() => leaveStep("discovery")}
      onBackToLanding={() => leaveStep("landing")}
      onBackToArchitect={() => leaveStep("architect")}
    />
  );
}
