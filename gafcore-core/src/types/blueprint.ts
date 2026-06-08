/**
 * Contrato del Blueprint Generator (módulo 2).
 */
import type { ParsedAppIdea, ParsedEntity, FieldType } from "./parsed-idea";

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
  description: string;
};

export type BlueprintColumn = {
  name: string;
  sqlType: "TEXT" | "INTEGER" | "REAL";
  primaryKey?: boolean;
  notNull?: boolean;
  unique?: boolean;
};

export type BlueprintTable = {
  name: string;
  entity: string;
  columns: BlueprintColumn[];
};

export type BlueprintFrontendRoute = {
  path: string;
  component: string;
  requiresAuth: boolean;
};

export type AppBlueprint = {
  version: 1;
  slug: string;
  parsed: ParsedAppIdea;
  stack: BlueprintStack;
  tables: BlueprintTable[];
  apiRoutes: BlueprintApiRoute[];
  frontendRoutes: BlueprintFrontendRoute[];
  /** Rutas de archivos que el Code Generator creará */
  outputFiles: string[];
};

/** Mapeo campo parseado → tipo SQL (SQLite) */
export function fieldTypeToSql(type: FieldType): BlueprintColumn["sqlType"] {
  switch (type) {
    case "number":
      return "REAL";
    case "boolean":
      return "INTEGER";
    default:
      return "TEXT";
  }
}

export function entityToTable(entity: ParsedEntity): BlueprintTable {
  return {
    name: entity.tableName,
    entity: entity.name,
    columns: entity.fields.map((f) => ({
      name: f.name,
      sqlType: fieldTypeToSql(f.type),
      primaryKey: f.name === "id",
      notNull: f.required,
      unique: f.unique,
    })),
  };
}
