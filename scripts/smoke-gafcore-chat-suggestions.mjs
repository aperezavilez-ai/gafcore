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

const taxi = getGafcoreChatNextSteps({
  messages: [{ role: "user", content: "app taxi con botón pánico" }],
  files: [
    {
      name: "App.tsx",
      content: 'export default function App(){return <h1>TAXIDRIV Tu viaje en un toque</h1>}',
    },
  ],
  mode: "build",
  factoryMode: false,
  visualEditOn: false,
  multiAgentMode: false,
  factoryAutoDeploy: false,
  lastError: null,
  pipelineStatus: null,
  validationLabel: null,
});
if (!taxi.some((s) => s.id === "taxi-911" || s.label.includes("911"))) {
  throw new Error("taxi project should suggest panic/911 step");
}

console.log("smoke-gafcore-chat-suggestions: ok", {
  empty: empty.length,
  security: security.length,
  taxi: taxi.length,
});
