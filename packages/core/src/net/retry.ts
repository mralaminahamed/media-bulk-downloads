/**
 * Bounded retry-with-backoff wrapper for fetch. A transient failure — a network
 * reject, or an HTTP 429/500/502/503/504 — is retried with exponential backoff
 * plus full jitter, honoring Retry-After. Any other outcome (2xx/3xx/4xx except
 * 429) is returned immediately. The wrapper has the SAME signature as fetch and
 * returns the final Response UNREAD (or re-throws the last network error), so a
 * caller's existing status handling and `catch { return null }` are unchanged.
 */

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

/** Default per-ATTEMPT fetch timeout (ms). Without this, a slow/unresponsive
 *  PUBLIC host — one that accepts the TCP connection but never responds — makes
 *  `fetch()` hang forever: `assertSafeCaptureUrl` only blocks internal/private
 *  hosts, and neither `retryingFetch` nor its callers ever aborted a stuck
 *  attempt. That wedges the whole capture (the offscreen doc holds the
 *  connection, `captureRunTabs` leaks, the UI shows "Capturing…" forever) with
 *  no recovery but an extension reload. Each attempt gets its own budget, so a
 *  bounded retry loop still runs and the capture fails with a normal coded
 *  error instead of hanging. */
export const FETCH_TIMEOUT_MS = 30_000;

export interface RetryOpts {
  /** Total attempts including the first. Default 3. */
  maxAttempts?: number;
  /** Exponential backoff base in ms. Default 300. */
  baseDelayMs?: number;
  /** Cap on any single delay (and on Retry-After). Default 5000. */
  maxDelayMs?: number;
  /** Abort cancels a pending backoff and stops retrying; also aborts an
   *  in-flight attempt (not just a pending backoff sleep). */
  signal?: AbortSignal;
  /** Per-attempt timeout (ms). When set, each attempt gets its own
   *  AbortController that aborts the attempt after this many ms — combined
   *  with `signal`, if given — so a hung fetch can't stall the whole capture. */
  timeoutMs?: number;
  /** Injectable sleep (tests). Default: setTimeout that also rejects on abort. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Injectable full-jitter source in [0,1). Default Math.random. */
  random?: () => number;
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    function onAbort() { clearTimeout(t); reject(signal!.reason ?? new DOMException('Aborted', 'AbortError')); }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Parse a Retry-After header (delta-seconds or HTTP-date) to ms, or null. */
function parseRetryAfter(value: string | null, nowMs: number): number | null {
  if (!value) return null;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - nowMs);
  return null;
}

export function retryingFetch(rawFetch: typeof fetch, opts: RetryOpts = {}): typeof fetch {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 300;
  const maxDelayMs = opts.maxDelayMs ?? 5000;
  const sleep = opts.sleep ?? defaultSleep;
  const random = opts.random ?? Math.random;

  const backoff = async (attempt: number, retryAfterMs: number | null): Promise<void> => {
    const cap = retryAfterMs != null
      ? Math.min(maxDelayMs, retryAfterMs)
      : Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
    // Full jitter for computed backoff; a Retry-After is a server-requested floor,
    // so honor it as-is (don't jitter below the wait it asked for).
    const delay = retryAfterMs != null ? cap : random() * cap;
    await sleep(delay, opts.signal);
  };

  const timeoutMs = opts.timeoutMs;

  return (async (...args: Parameters<typeof fetch>): Promise<Response> => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (opts.signal?.aborted) throw opts.signal.reason ?? new DOMException('Aborted', 'AbortError');
      let res: Response;
      // Bound THIS attempt: a fresh AbortController per attempt (so a timed-out
      // attempt never poisons the next retry), aborted either by `timeoutMs`
      // elapsing or by the caller's own `signal` aborting mid-flight (not just
      // during backoff, which `backoff()`'s sleep already honors).
      const attemptAc = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const onOuterAbort = (): void => attemptAc.abort(opts.signal!.reason ?? new DOMException('Aborted', 'AbortError'));
      if (timeoutMs != null) {
        timer = setTimeout(
          () => attemptAc.abort(new DOMException(`Fetch timed out after ${timeoutMs}ms.`, 'AbortError')),
          timeoutMs,
        );
      }
      opts.signal?.addEventListener('abort', onOuterAbort, { once: true });
      try {
        const [input, init] = args;
        res = await rawFetch(input, { ...init, signal: attemptAc.signal });
      } catch (e) {
        lastError = e;
        if (attempt >= maxAttempts) throw e;
        await backoff(attempt, null);
        continue;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onOuterAbort);
      }
      // Non-transient status, or last attempt → return this Response unread.
      if (!RETRYABLE_STATUS.has(res.status) || attempt >= maxAttempts) return res;
      // Transient with attempts left: read only Retry-After, discard the body, retry.
      const retryAfterMs = parseRetryAfter(res.headers.get('Retry-After'), Date.now());
      res.body?.cancel().catch(() => {});
      await backoff(attempt, retryAfterMs);
    }
    // Unreachable — the loop always returns or throws — but satisfies the type.
    throw lastError ?? new Error('retryingFetch: exhausted');
  }) as typeof fetch;
}
