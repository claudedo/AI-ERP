import type { Analysis, ArchitectureOption } from "../types";
export const ONBOARDING_KEY = "nodus-onboarding-v1";
export interface OnboardingDraft {
  version: 1;
  description: string;
  analysis: Analysis | null;
  selected: ArchitectureOption | null;
  automation: boolean;
  stage: string;
  sector: string;
}
export const emptyOnboarding = (): OnboardingDraft => ({
  version: 1,
  description: "",
  analysis: null,
  selected: null,
  automation: true,
  stage: "landing",
  sector: "",
});
export function loadOnboarding(): OnboardingDraft {
  try {
    const raw = localStorage.getItem(ONBOARDING_KEY);
    if (!raw) return emptyOnboarding();
    const draft = JSON.parse(raw) as OnboardingDraft;
    if (
      draft.version !== 1 ||
      typeof draft.description !== "string" ||
      ![
        "landing",
        "discovery",
        "analysis",
        "architect",
        "suggestions",
        "building",
      ].includes(draft.stage)
    )
      return emptyOnboarding();
    if (
      draft.analysis &&
      (!Array.isArray(draft.analysis.process) ||
        !Array.isArray(draft.analysis.branches) ||
        typeof draft.analysis.industry !== "string" ||
        typeof draft.analysis.companyName !== "string")
    )
      return emptyOnboarding();
    if (
      draft.selected &&
      (!["simple", "process", "advanced"].includes(draft.selected.id) ||
        !Array.isArray(draft.selected.modules) ||
        !draft.selected.modules.every((item) => typeof item === "string"))
    )
      draft.selected = null;
    const stage =
      draft.stage === "analysis"
        ? "discovery"
        : draft.stage === "building"
          ? "suggestions"
          : draft.stage;
    return {
      ...emptyOnboarding(),
      ...draft,
      automation:
        typeof draft.automation === "boolean" ? draft.automation : true,
      sector: typeof draft.sector === "string" ? draft.sector : "",
      stage:
        ["architect", "suggestions"].includes(stage) && !draft.analysis
          ? "discovery"
          : stage === "suggestions" && !draft.selected
            ? "architect"
            : stage,
    };
  } catch {
    return emptyOnboarding();
  }
}
