import type { AgentType } from "@/tasks/types";

export type AgentCapability = {
  type: AgentType;
  canWriteFiles: boolean;
  maxRetries: number;
  defaultPriority: "critical" | "high" | "normal" | "low";
  defaultAllow: string[];
  defaultDeny: string[];
};

export const AGENT_REGISTRY: Record<AgentType, AgentCapability> = {
  planner: {
    type: "planner",
    canWriteFiles: false,
    maxRetries: 1,
    defaultPriority: "critical",
    defaultAllow: [],
    defaultDeny: ["**"],
  },
  frontend: {
    type: "frontend",
    canWriteFiles: true,
    maxRetries: 1,
    defaultPriority: "normal",
    defaultAllow: ["src/components/**", "src/routes/**", "src/styles.css", "src/**/*.css"],
    defaultDeny: ["supabase/**", "src/lib/**"],
  },
  backend: {
    type: "backend",
    canWriteFiles: true,
    maxRetries: 1,
    defaultPriority: "normal",
    defaultAllow: ["src/lib/**", "src/routes/api/**", "src/server.ts"],
    defaultDeny: ["supabase/migrations/**"],
  },
  database: {
    type: "database",
    canWriteFiles: true,
    maxRetries: 0,
    defaultPriority: "high",
    defaultAllow: ["supabase/migrations/**"],
    defaultDeny: ["src/**"],
  },
  validation: {
    type: "validation",
    canWriteFiles: false,
    maxRetries: 0,
    defaultPriority: "high",
    defaultAllow: [],
    defaultDeny: ["**"],
  },
  deployment: {
    type: "deployment",
    canWriteFiles: false,
    maxRetries: 1,
    defaultPriority: "low",
    defaultAllow: [],
    defaultDeny: ["**"],
  },
  documentation: {
    type: "documentation",
    canWriteFiles: true,
    maxRetries: 1,
    defaultPriority: "low",
    defaultAllow: ["docs/**", "README.md"],
    defaultDeny: ["src/**"],
  },
  refactor: {
    type: "refactor",
    canWriteFiles: true,
    maxRetries: 1,
    defaultPriority: "normal",
    defaultAllow: ["src/**"],
    defaultDeny: ["supabase/**"],
  },
  debug: {
    type: "debug",
    canWriteFiles: true,
    maxRetries: 2,
    defaultPriority: "critical",
    defaultAllow: ["src/**"],
    defaultDeny: ["supabase/migrations/**"],
  },
};
