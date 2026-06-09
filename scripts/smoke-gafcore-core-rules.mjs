import {
  evaluateCoreOrchestrationGate,
  isInternalOrchestrationInstruction,
} from "../src/core/behavior/gafcore-core-rules.shared.ts";
import {
  buildLocalProjectAnalysis,
  formatProjectAnalysisForChat,
} from "../src/core/behavior/gafcore-project-analysis.shared.ts";

const okGate = evaluateCoreOrchestrationGate({
  blockingError: null,
  validationBlocked: false,
});

if (okGate.blockAutonomousAdvance) {
  throw new Error("clean state must not block autonomous advance");
}

const blockedGate = evaluateCoreOrchestrationGate({
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
