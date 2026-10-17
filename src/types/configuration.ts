import type { DashboardWidget, Entity, Role, View, Workflow } from "./index";

export interface Configuration {
  entities: Omit<Entity, "records">[];
  views: View[];
  workflows: Workflow[];
  dashboardWidgets: DashboardWidget[];
  roles: Role[];
}
export interface ConfigurationDraft { id: string; baseVersion: number; configuration: Configuration; updatedAt: string }
export interface ConfigurationVersion { version: number; configuration: Configuration; publishedAt: string; userId: string }
