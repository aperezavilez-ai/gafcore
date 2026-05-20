import { completeChatMessage } from "@/lib/gafcore-ai-gateway.server";
import type { GafcoreChatMessage } from "@/lib/gafcore-chat.shared";

let workflowAiInFlight = 0;
const workflowAiWaiters: Array<() => void> = [];

function getMaxWorkflowAiConcurrent(): number {
  const raw = process.env.GAFCORE_WORKFLOW_MAX_AI_CONCURRENT?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 2;
  if (!Number.isFinite(n) || n < 1) return 2;
  return Math.min(n, 6);
}

function getWorkflowAiMaxRetries(): number {
  const raw = process.env.GAFCORE_WORKFLOW_AI_RETRY_MAX?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 3;
  if (!Number.isFinite(n) || n < 0) return 3;
  return Math.min(n, 6);
}

function drainWorkflowAiQueue(): void {
  const max = getMaxWorkflowAiConcurrent();
  while (workflowAiInFlight < max && workflowAiWaiters.length > 0) {
    const next = workflowAiWaiters.shift();
    next?.();
  }
}

async function acquireWorkflowAiSlot(): Promise<() => void> {
  const max = getMaxWorkflowAiConcurrent();
  if (workflowAiInFlight < max) {
    workflowAiInFlight += 1;
    return () => {
      workflowAiInFlight = Math.max(0, workflowAiInFlight - 1);
      drainWorkflowAiQueue();
    };
  }
  await new Promise<void>((resolve) => workflowAiWaiters.push(resolve));
  workflowAiInFlight += 1;
  return () => {
    workflowAiInFlight = Math.max(0, workflowAiInFlight - 1);
    drainWorkflowAiQueue();
  };
}

function backoffMs(attempt: number): number {
  const base = 800;
  return Math.min(base * 2 ** attempt, 12_000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** B5: cola IA en proceso + reintentos ante 429 del proveedor. */
export async function completeChatMessageViaWorkflowQueue(input: {
  model: string;
  messages: GafcoreChatMessage[] | Array<{ role: string; content: string }>;
  temperature?: number;
  json?: boolean;
}): Promise<{ content: string; raw: unknown }> {
  const release = await acquireWorkflowAiSlot();
  const maxRetries = getWorkflowAiMaxRetries();

  try {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        return await completeChatMessage(input);
      } catch (e) {
        lastErr = e;
        const code = (e as Error & { code?: string })?.code;
        const status = (e as Error & { status?: number })?.status;
        const isRateLimited = code === "rate_limited" || status === 429;
        if (isRateLimited && attempt < maxRetries) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw e;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("workflow_ai_failed");
  } finally {
    release();
  }
}
