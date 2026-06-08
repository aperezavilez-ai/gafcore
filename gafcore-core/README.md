# GafCore — Minimal Core (v2)

Nuevo núcleo de generación de apps. **Ignora** la orquestación, multi-agente, memoria y SSR del IDE legacy.

## Objetivo

```
User idea  →  Input Parser  →  Blueprint  →  Code Generator  →  Runner  →  App funcional
```

## Módulos (solo estos 4)

| # | Módulo | Estado | Responsabilidad |
|---|--------|--------|-----------------|
| 1 | **Input Parser** | ✅ Implementado | Idea en lenguaje natural → JSON estructurado |
| 2 | **Blueprint Generator** | 🔲 Pendiente | JSON → páginas, features, entidades, auth |
| 3 | **Code Generator** | 🔲 Pendiente | Blueprint → backend + schema + frontend conectado |
| 4 | **Runner** | 🔲 Pendiente | Build + run local sin errores de runtime |

## Estructura

```
gafcore-core/
  README.md
  src/
    index.ts                 # API pública del core
    types/
      parsed-idea.ts         # Salida del Input Parser
      blueprint.ts           # Contrato del Blueprint Generator
    modules/
      input-parser/          # Módulo 1 — implementado
      blueprint-generator/   # Módulo 2 — stub
      code-generator/        # Módulo 3 — stub
      runner/                # Módulo 4 — stub
  scripts/
    parse-cli.ts             # Probar el parser desde terminal
```

## Uso (Input Parser)

```bash
npm run gafcore:parse -- "todo app with login"
npm run gafcore:parse -- "tienda de zapatos con carrito y login"
```

```ts
import { parseUserIdea } from "../gafcore-core/src";

const parsed = parseUserIdea("todo app with login");
console.log(JSON.stringify(parsed, null, 2));
```

## Reglas del core

- Sin mocks ni placeholders en código generado (módulos 3–4).
- Sin UI sin lógica.
- Sin abstracciones hasta que hagan falta.
- El legacy en `src/` no se modifica para este core; convivirán hasta migración.
