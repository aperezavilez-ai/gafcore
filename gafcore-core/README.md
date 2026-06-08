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
| 2 | **Blueprint Generator** | ✅ Implementado | JSON → tablas SQL, rutas API, páginas, archivos |
| 3 | **Code Generator** | ✅ Implementado | Blueprint → Express + SQLite + React conectados |
| 4 | **Runner** | ✅ Implementado | install + db:push + smoke /api/health |

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

## Uso

```bash
# Módulo 1 — solo parser
npm run gafcore:parse -- "todo app with login"

# Módulos 1 + 2 — idea → blueprint completo
npm run gafcore:blueprint -- "todo app with login"

# Módulos 1 + 2 + 3 — genera app en disco
npm run gafcore:generate -- "todo app with login"

# Pipeline completo 1→4 — genera, instala, DB y verifica API
npm run gafcore:run -- "todo app with login"

# Dejar dev corriendo (API + cliente)
npm run gafcore:run -- "todo app with login" --keep
```

```ts
import { generateAndRun } from "../gafcore-core/src";

const { run } = await generateAndRun("todo app with login");
// run.ok === true → app arrancó sin errores de runtime
```

## Reglas del core

- Sin mocks ni placeholders en código generado (módulos 3–4).
- Sin UI sin lógica.
- Sin abstracciones hasta que hagan falta.
- El legacy en `src/` no se modifica para este core; convivirán hasta migración.
