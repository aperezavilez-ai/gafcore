import {
  detectProjectTypeFromUserText,
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

if (getGafcoreChatNextSteps(welcomeCtx).length !== 0) {
  throw new Error("empty chat must show zero suggestions");
}

const landingCtx = {
  messages: [{ role: "user", content: "quiero una landing premium con formulario de contacto" }],
  files: [
    {
      name: "App.tsx",
      content:
        'export default function App(){return <main><h1>Mi marca</h1><p>Tu landing en minutos</p><a href="#contacto">Contacto</a><form onSubmit={(e)=>e.preventDefault()}><input type="email"/></form></main>}',
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
};

if (detectProjectTypeFromUserText(landingCtx.messages[0].content) !== "landing") {
  throw new Error("landing message must detect landing project type");
}

const landingSteps = getGafcoreChatNextSteps(landingCtx);
if (landingSteps.length !== 8) {
  throw new Error(`landing roadmap must have 8 steps, got ${landingSteps.length}`);
}
if (!landingSteps.some((s) => s.label === "Hero section")) {
  throw new Error("landing must include Hero section chip");
}
if (!landingSteps.slice(-3).every((s) => s.id.startsWith("deploy-"))) {
  throw new Error("roadmap must end with deploy chips");
}

const ecommerceCtx = {
  ...landingCtx,
  messages: [{ role: "user", content: "quiero una tienda para vender productos online" }],
};
const ecommerceSteps = getGafcoreChatNextSteps(ecommerceCtx);
if (!ecommerceSteps.some((s) => s.label === "Catálogo de productos")) {
  throw new Error("ecommerce must include catalog chip");
}

const errorCtx = {
  ...landingCtx,
  lastError: "Objects are not valid as a React child (React error #31)",
};
const errorSteps = getGafcoreChatNextSteps(errorCtx);
if (!errorSteps.some((s) => s.id === "fix-runtime")) {
  throw new Error("active preview error must show fix-runtime chip");
}

const staleErrorCtx = {
  ...landingCtx,
  messages: [
    ...landingCtx.messages,
    { role: "ai", content: "Hubo un SyntaxError antiguo en preview-error logs" },
  ],
  lastError: null,
};
if (getGafcoreChatNextSteps(staleErrorCtx).length !== 8) {
  throw new Error("stale error text in history must not force error-recovery chips");
}

if (hasSubstantiveUserIntent([{ role: "user", content: "hola" }])) {
  throw new Error("short greeting is not substantive intent");
}

console.log("smoke-gafcore-chat-suggestions: ok", {
  landing: landingSteps.map((s) => s.label),
  ecommerce: ecommerceSteps.map((s) => s.label),
  error: errorSteps.map((s) => s.label),
});
