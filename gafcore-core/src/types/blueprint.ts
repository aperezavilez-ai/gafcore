/**
 * Contrato del Blueprint Generator (módulo 2) — aún no implementado.
 */
import type { ParsedAppIdea } from "./parsed-idea";

export type BlueprintStack = {
  frontend: "react-vite";
  backend: "express";
  database: "sqlite";
  orm: "drizzle";
};

export type BlueprintApiRoute = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  handler: string;
  auth: boolean;
  entity?: string;
};

export type AppBlueprint = {
  version: 1;
  parsed: ParsedAppIdea;
  stack: BlueprintStack;
  apiRoutes: BlueprintApiRoute[];
  /** Rutas de archivos que el Code Generator creará */
  outputFiles: string[];
};
