export type RunStep = {
  step: string;
  ok: boolean;
  detail?: string;
  ms?: number;
};

export type RunResult = {
  ok: boolean;
  root: string;
  slug: string;
  apiUrl: string;
  clientUrl: string;
  steps: RunStep[];
  error?: string;
  /** PID del proceso dev si quedó en ejecución */
  devPid?: number;
};

export type RunGeneratedAppOptions = {
  /** Directorio base donde está app.rootDir. Default: process.cwd() */
  baseDir?: string;
  apiPort?: number;
  clientPort?: number;
  /** Ejecutar npm install (default true) */
  install?: boolean;
  /** Ejecutar npm run db:push (default true) */
  pushDb?: boolean;
  /**
   * false = smoke test (arranca API, verifica /api/health, para)
   * true = deja `npm run dev` corriendo
   */
  keepDevRunning?: boolean;
  healthTimeoutMs?: number;
};
