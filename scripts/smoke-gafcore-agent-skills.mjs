#!/usr/bin/env node
import {
  AGENT_REGISTRY,
  buildAgentExecutionPrompt,
  buildPlannerAgentCatalogPrompt,
  buildProfessionalAgentPromptAppend,
  buildPromptMasterPromptAppend,
  isPromptMasterRequest,
  selectProfessionalSkills,
} from "../src/agents/registry.shared.ts";

const instruction = "crea una landing page profesional para una barberia con reservas, servicios y pagos";
const skills = selectProfessionalSkills(instruction).map((skill) => skill.id);

for (const expected of ["landing-profesional", "booking-reservas", "ecommerce", "stripe-billing", "visual-polish"]) {
  if (!skills.includes(expected)) {
    throw new Error(`skill faltante: ${expected}`);
  }
}

const prompt = buildProfessionalAgentPromptAppend(instruction);
for (const expected of ["Arquitecto de producto", "Frontend UX/UI premium", "QA y Build Doctor", "Landing profesional"]) {
  if (!prompt.includes(expected)) {
    throw new Error(`prompt profesional incompleto: ${expected}`);
  }
}

const frontend = AGENT_REGISTRY.frontend;
if (!frontend.defaultAllow.includes("App.tsx")) {
  throw new Error("frontend debe poder escribir App.tsx en proyectos del IDE");
}

const plannerCatalog = buildPlannerAgentCatalogPrompt();
if (!plannerCatalog.includes("Skills profesionales disponibles")) {
  throw new Error("catalogo planner sin skills");
}

const executionPrompt = buildAgentExecutionPrompt("validation");
if (!executionPrompt.includes("Build Doctor") || !executionPrompt.includes("functional-audit")) {
  throw new Error("perfil de validation incompleto");
}

const promptMasterInstruction = "mejora este prompt para Lovable y agrega criterios de exito";
const promptMasterSkills = selectProfessionalSkills(promptMasterInstruction).map((skill) => skill.id);
if (!promptMasterSkills.includes("prompt-master")) {
  throw new Error("prompt-master debe activarse para prompts de Lovable");
}
if (!isPromptMasterRequest(promptMasterInstruction)) {
  throw new Error("isPromptMasterRequest no detecto prompt engineering");
}
const promptMasterAppend = buildPromptMasterPromptAppend(promptMasterInstruction);
if (!promptMasterAppend.includes("PROMPT MASTER GAFCORE") || !promptMasterAppend.includes("files: []")) {
  throw new Error("prompt-master append incompleto");
}

console.log("[smoke-agent-skills] OK");
