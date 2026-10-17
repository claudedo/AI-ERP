import { useState } from "react";
import { Clock3, GitBranch, Play, Plus, Zap } from "lucide-react";
import type { Workflow, Workspace } from "../types";
import { WorkflowEditor } from "./WorkflowEditor";

export function AutomationsPage({
  workspace,
  workflows,
  canEdit,
  onToggle,
  onCreate,
  onSave,
}: {
  workspace: Workspace;
  workflows: Workflow[];
  canEdit: boolean;
  onToggle: (id: string) => void;
  onCreate: () => void;
  onSave: (flow: Workflow) => boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  workflows = workflows.map((flow) => ({
    ...flow,
    runs: flow.runs.map((run) =>
      run.demo ? { ...run, summary: `ESEMPIO DEMO · ${run.summary}` } : run,
    ),
  }));
  const runs = workflows.flatMap((w) => w.runs).filter((run) => !run.demo),
    weekStart = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const runsThisWeek = runs.filter(
    (r) => new Date(r.at).getTime() >= weekStart,
  ).length;
  const successRate = runs.length
    ? `${Math.round((runs.filter((r) => r.status === "success").length / runs.length) * 100)}%`
    : "—";
  return (
    <div className="entity-page automations-page">
      <div className="page-heading">
        <div>
          <span className="overline">WORKSPACE / AUTOMATIONS</span>
          <h1>Automations</h1>
          <p>
            {workflows.filter((w) => w.active).length} active workflows ·{" "}
            {runs.length} recorded runs · browser-only execution
          </p>
        </div>
        {canEdit && (
          <div className="heading-actions">
            <button className="secondary" onClick={() => setEditing(true)}>
              <Plus size={15} />
              Create workflow
            </button>
            <button className="primary" onClick={onCreate}>
              <GitBranch />
              Design with NODUS AI
            </button>
          </div>
        )}
      </div>
      <div className="automation-summary">
        <div>
          <Zap />
          <span>
            <strong>{workflows.filter((w) => w.active).length}</strong>Active
          </span>
        </div>
        <div>
          <Play />
          <span>
            <strong>{runsThisWeek}</strong>Runs this week
          </span>
        </div>
        <div>
          <Clock3 />
          <span>
            <strong>{successRate}</strong>Success rate
          </span>
        </div>
      </div>
      <div className="automation-list">
        {workflows.map((w) => (
          <article className="workflow-card" key={w.id}>
            <div className="workflow-head">
              <span className="workflow-icon">
                <Zap />
              </span>
              <div>
                <h3>{w.name}</h3>
                <p>{w.trigger}</p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  aria-label={`Enable ${w.name}`}
                  checked={w.active}
                  disabled={!canEdit}
                  onChange={() => onToggle(w.id)}
                />
                <span />
              </label>
            </div>
            <div className="workflow-line">
              <span>WHEN</span>
              <strong>{w.trigger}</strong>
            </div>
            {w.config?.conditionFieldId && (
              <div className="workflow-line">
                <span>IF</span>
                <strong>
                  {w.config.conditionFieldId} {w.config.conditionOperator}{" "}
                  {w.config.conditionValue}
                </strong>
              </div>
            )}
            {w.actions.map((a, i) => (
              <div className="workflow-line" key={a}>
                <span>{i === 0 ? "THEN" : "AND"}</span>
                <strong>{a}</strong>
              </div>
            ))}
            <footer>
              <span className={w.active ? "live" : "paused"}>
                {w.active ? "Active" : "Paused"}
              </span>
              <span>
                {w.runs[0]
                  ? `Last run ${new Date(w.runs[0].at).toLocaleDateString("en-GB")}`
                  : "No runs yet"}
              </span>
              {w.runs.length > 0 && (
                <button
                  aria-expanded={expanded === w.id}
                  onClick={() => setExpanded(expanded === w.id ? null : w.id)}
                >
                  {expanded === w.id ? "Hide history ↑" : "View history →"}
                </button>
              )}
            </footer>
            {expanded === w.id && (
              <div className="workflow-history">
                {w.runs.map((run) => (
                  <div key={run.id}>
                    <time dateTime={run.at}>
                      {new Date(run.at).toLocaleString("en-GB")}
                    </time>
                    <strong>{run.status}</strong>
                    <span>{run.summary}</span>
                  </div>
                ))}
              </div>
            )}
          </article>
        ))}
        {workflows.length === 0 && (
          <div className="empty-state">
            <Zap />
            <h3>No automations yet</h3>
            <p>Use NODUS AI Builder to turn repetitive work into a workflow.</p>
            {canEdit && (
              <button className="secondary" onClick={() => setEditing(true)}>
                <Plus />
                Create automation
              </button>
            )}
          </div>
        )}
      </div>
      {editing && (
        <WorkflowEditor
          workspace={workspace}
          onClose={() => setEditing(false)}
          onSave={onSave}
        />
      )}
    </div>
  );
}
