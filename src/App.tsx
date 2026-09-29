import { useState } from "react";
import { analyzeBusiness, generateArchitectureOptions, generateWorkspace } from "./services/aiEngine";
import { useWorkspace } from "./hooks/useWorkspace";
import type { Analysis, ArchitectureOption } from "./types";
import { Landing } from "./pages/Landing";
import { Builder } from "./pages/Builder";
import { WorkspaceApp } from "./pages/WorkspaceApp";

type Stage = "landing" | "discovery" | "analysis" | "architect" | "suggestions" | "building" | "workspace";
export default function App() {
  const { workspace, setWorkspace, reset } = useWorkspace();
  const [stage, setStage] = useState<Stage>(workspace ? "workspace" : "landing");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [selected, setSelected] = useState<ArchitectureOption | null>(null);
  const [automation, setAutomation] = useState(true);

  const begin = (description: string) => {
    const result = analyzeBusiness(description); setAnalysis(result); setStage("analysis");
    window.setTimeout(() => setStage("architect"), 3400);
  };
  const build = () => {
    if (!analysis || !selected) return; setStage("building");
    window.setTimeout(() => { const next=generateWorkspace(analysis, selected); if(!automation)next.workflows=next.workflows.map(w=>w.id==="confirmed-order-task"?{...w,active:false}:w); setWorkspace(next); setStage("workspace"); }, 3300);
  };
  if (stage === "landing") return <Landing onStart={() => setStage("discovery")} />;
  if (stage === "workspace" && workspace) return <WorkspaceApp workspace={workspace} setWorkspace={setWorkspace} onReset={() => { reset(); setStage("landing"); }} />;
  return <Builder stage={stage} analysis={analysis} options={analysis ? generateArchitectureOptions(analysis) : []} selected={selected} automation={automation} onAutomationChange={setAutomation} onSubmit={begin} onSelect={setSelected} onContinue={() => setStage("suggestions")} onBuild={build} onBack={() => setStage("discovery")} onBackToLanding={() => setStage("landing")} onBackToArchitect={() => setStage("architect")} />;
}
