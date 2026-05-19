export type { ProjectRow, ProjectDeployMeta } from "@/lib/userSupabase";

export type ActiveProjectState = {
  id: string | null;
  name: string;
  row: import("@/lib/userSupabase").ProjectRow | null;
};

export type WorkspaceBootstrap = {
  projects: import("@/lib/userSupabase").ProjectRow[];
  active: ActiveProjectState;
  hasSupabase: boolean;
};
