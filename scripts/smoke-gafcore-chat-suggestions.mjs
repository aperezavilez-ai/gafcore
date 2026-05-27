import {
  getGafcoreChatNextSteps,
  hasSubstantiveUserIntent,
  projectHasStarted,
} from "../src/lib/gafcore-chat-suggestions.shared.ts";

const welcomeFiles = [
  {
    name: "App.tsx",
    content:
      "Bienvenidos a GafCore. Empieza escribiendo en el chat. Diseña, construye y publica tu sitio web o app",
  },
];

const welcomeCtx = {
  messages: [],
  files: welcomeFiles,
  mode: "build",
  factoryMode: false,
  visualEditOn: false,
  multiAgentMode: false,
  factoryAutoDeploy: false,
  lastError: null,
  pipelineStatus: null,
  validationLabel: null,
};

if (projectHasStarted(welcomeCtx)) {
  throw new Error("welcome workspace must not count as started project");
}

const welcomeNoIntent = getGafcoreChatNextSteps(welcomeCtx);
if (welcomeNoIntent.length !== 0) {
  throw new Error("welcome template must show zero suggestions");
}

const welcomeWithChat = getGafcoreChatNextSteps({
  ...welcomeCtx,
  messages: [{ role: "user", content: "app taxi con botón pánico y viaje en vivo" }],
});
if (welcomeWithChat.length !== 0) {
  throw new Error("welcome + chat intent must still show zero suggestions until project exists");
}

const welcomeWithError = getGafcoreChatNextSteps({
  ...welcomeCtx,
  lastError: "Objects are not valid as a React child",
});
if (welcomeWithError.length !== 0) {
  throw new Error("welcome + preview error must not show suggestion chips");
}

const security = getGafcoreChatNextSteps({
  messages: [
    { role: "user", content: "configura supabase" },
    {
      role: "ai",
      content: "He añadido políticas RLS y revisado permisos de realtime para auth.",
    },
  ],
  files: [{ name: "App.tsx", content: "export default function App(){ return <div /> }" }],
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
  messages: [{ role: "user", content: "app taxi con botón pánico y viaje en vivo" }],
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
if (taxi.some((s) => s.id === "add-contact")) {
  throw new Error("taxi project must not suggest generic contact form");
}

if (hasSubstantiveUserIntent([{ role: "user", content: "hola" }])) {
  throw new Error("short greeting is not substantive intent");
}

console.log("smoke-gafcore-chat-suggestions: ok", {
  welcomeNoIntent: welcomeNoIntent.length,
  security: security.length,
  taxi: taxi.length,
});
