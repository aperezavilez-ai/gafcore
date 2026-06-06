import {
  evaluateCoreOrchestrationGate,
  isInternalOrchestrationInstruction,
  markBuildConfirmedInstruction,
} from "../src/core/behavior/gafcore-core-rules.shared.ts";
import {
  buildLocalProjectAnalysis,
  formatProjectAnalysisForChat,
} from "../src/core/behavior/gafcore-project-analysis.shared.ts";

const substantiveGate = evaluateCoreOrchestrationGate({
  instruction: "Crea una tienda online con carrito",
  rawUserText: "Crea una tienda online con carrito",
  mode: "build",
  factoryMode: false,
  multiAgentMode: false,
  visualEditOn: false,
  buildConfirmed: false,
  blockingError: null,
  validationBlocked: false,
});

if (!substantiveGate.requiresBuildConfirmation) {
  throw new Error("substantive build must require confirmation");
}

const confirmedGate = evaluateCoreOrchestrationGate({
  instruction: markBuildConfirmedInstruction("Crea una tienda online"),
  rawUserText: "Crea una tienda online",
  mode: "build",
  factoryMode: false,
  multiAgentMode: false,
  visualEditOn: false,
  buildConfirmed: true,
  blockingError: null,
  validationBlocked: false,
});

if (confirmedGate.requiresBuildConfirmation) {
  throw new Error("confirmed build must skip confirmation gate");
}

const blockedGate = evaluateCoreOrchestrationGate({
  instruction: "Siguiente paso",
  rawUserText: "Siguiente paso",
  mode: "build",
  factoryMode: false,
  multiAgentMode: false,
  visualEditOn: false,
  buildConfirmed: true,
  blockingError: "SyntaxError: Unexpected token",
  validationBlocked: false,
});

if (!blockedGate.blockAutonomousAdvance) {
  throw new Error("preview syntax error must block autonomous advance");
}

if (!isInternalOrchestrationInstruction("[GUÍA GAFCORE — paso 2: UI] continuar")) {
  throw new Error("guide autopilot instruction must be internal");
}

const analysis = buildLocalProjectAnalysis("Haz una app SaaS con login y dashboard", 3);
const chat = formatProjectAnalysisForChat(analysis);
if (!chat.includes("¿Deseas comenzar la construcción")) {
  throw new Error("analysis chat must ask for confirmation");
}
if (analysis.workflowSteps.length < 4) {
  throw new Error("analysis must include multiple workflow steps");
}

console.log("smoke-gafcore-core-rules: ok", {
  complexity: analysis.complexity,
  steps: analysis.workflowSteps.length,
});
