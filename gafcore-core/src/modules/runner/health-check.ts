import { sleep } from "./exec";

export async function waitForApiHealth(
  url: string,
  timeoutMs: number,
): Promise<{ ok: boolean; body?: unknown; error?: string }> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4_000) });
      if (res.ok) {
        const body = (await res.json()) as { ok?: boolean };
        if (body.ok === true) return { ok: true, body };
        return { ok: false, error: "health_response_not_ok" };
      }
    } catch {
      /* retry */
    }
    await sleep(600);
  }

  return { ok: false, error: "health_timeout" };
}
