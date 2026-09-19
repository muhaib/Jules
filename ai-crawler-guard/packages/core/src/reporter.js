/**
 * Ships bot-hit events to the aggregation API.
 *
 * Constraints this is built around:
 *  - It runs inside somebody else's request path. It must never throw into it,
 *    never await network I/O in it, and never grow without bound.
 *  - Losing analytics events is acceptable; wedging the site is not. When the
 *    queue is full the oldest events are dropped and counted, so the operator
 *    can see the loss instead of guessing.
 */
const DEFAULT_ENDPOINT_PATH = '/v1/ingest';

export function createReporter({
  endpoint,
  siteKey,
  sink = null,
  batchSize = 50,
  flushIntervalMs = 10_000,
  maxQueue = 5_000,
  maxAttempts = 3,
  timeoutMs = 5_000,
  fetchImpl = globalThis.fetch,
  onError = () => {},
  now = Date.now,
} = {}) {
  const enabled = Boolean(sink || (endpoint && siteKey));
  const url = endpoint ? new URL(DEFAULT_ENDPOINT_PATH, endpoint).toString() : null;

  let queue = [];
  let timer = null;
  let flushing = null;
  const stats = { queued: 0, sent: 0, dropped: 0, failedBatches: 0, lastError: null };

  function schedule() {
    if (timer || !enabled || flushIntervalMs <= 0) return;
    timer = setInterval(() => {
      flush().catch(() => {});
    }, flushIntervalMs);
    timer.unref?.();
  }

  async function deliver(batch) {
    if (sink) {
      await sink(batch);
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${siteKey}`,
        },
        body: JSON.stringify({ events: batch }),
      });
      if (!response.ok) {
        const error = new Error(`ingest returned HTTP ${response.status}`);
        error.status = response.status;
        // A rejected key or a malformed batch will be rejected again on retry.
        error.permanent = response.status === 401 || response.status === 403 || response.status === 400;
        throw error;
      }
      // Drain the body so the socket can be reused.
      await response.arrayBuffer().catch(() => {});
    } finally {
      clearTimeout(timeout);
    }
  }

  async function sendBatch(batch) {
    let attempt = 0;
    for (;;) {
      attempt++;
      try {
        await deliver(batch);
        stats.sent += batch.length;
        return true;
      } catch (error) {
        stats.lastError = error;
        onError(error);
        if (error.permanent || attempt >= maxAttempts) {
          stats.failedBatches++;
          stats.dropped += batch.length;
          return false;
        }
        // Deliberately not unref'd: an unref'd backoff lets the process exit
        // mid-retry, which both loses the batch and leaves close()'s promise
        // unresolved. A flush in progress is worth a few seconds at shutdown.
        const backoff = Math.min(2 ** (attempt - 1) * 500, 8_000);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
  }

  async function drain() {
    while (queue.length) {
      const batch = queue.splice(0, batchSize);
      await sendBatch(batch);
    }
  }

  function flush() {
    if (!enabled) return Promise.resolve();
    if (flushing) return flushing;
    flushing = drain().finally(() => {
      flushing = null;
    });
    return flushing;
  }

  return {
    enabled,

    /** Fire-and-forget. Returns immediately; never rejects. */
    record(event) {
      if (!enabled) return;
      queue.push({ ts: new Date(now()).toISOString(), ...event });
      stats.queued++;
      if (queue.length > maxQueue) {
        const overflow = queue.length - maxQueue;
        queue.splice(0, overflow);
        stats.dropped += overflow;
      }
      schedule();
      if (queue.length >= batchSize) flush().catch(() => {});
    },

    flush,

    async close() {
      if (timer) clearInterval(timer);
      timer = null;
      await flush();
    },

    get pending() {
      return queue.length;
    },
    get stats() {
      return { ...stats, pending: queue.length };
    },
  };
}
