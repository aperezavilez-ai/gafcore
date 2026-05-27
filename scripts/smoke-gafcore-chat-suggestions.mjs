import { getGafcoreChatNextSteps } from "../src/lib/gafcore-chat-suggestions.shared.ts";

const empty = getGafcoreChatNextSteps({
  messages: [],
  files: [],
  mode: "build",
  factoryMode: false,
  visualEditOn: false,
  multiAgentMode: false,
  factoryAutoDeploy: false,
  lastError: null,
  pipelineStatus: null,
  validationLabel: null,
});
if (empty.length < 1) throw new Error("empty chat should suggest starters");

const security = getGafcoreChatNextSteps({
  messages: [
    { role: "user", content: "configura supabase" },
    {
      role: "ai",
      content: "He añadido políticas RLS y revisado permisos de realtime para auth.",
    },
  ],
  files: [{ name: "App.tsx", content: "<div />" }],
  mode: "build",
  factoryMode: false,
  visualEditOn: false,
  multiAgentMode: false,
  factoryAutoDeploy: false,
  lastError: null,
  pipelineStatus: null,
  validationLabel: null,
});
if (!security.some((s) => s.id === "sec-rls")) {
  throw new Error("security context should suggest RLS step");
}

console.log("smoke-gafcore-chat-suggestions: ok", { empty: empty.length, security: security.length });
