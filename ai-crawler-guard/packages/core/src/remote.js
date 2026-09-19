/**
 * A value fetched from somewhere else, refreshed on a timer, with the last
 * good copy kept if a refresh fails.
 *
 * Used for the crawler catalog and for the policy the dashboard edits. The
 * failure behaviour is the whole point: if the control plane is down, the
 * middleware keeps enforcing whatever it last knew rather than falling open.
 */
export class RemoteValue {
  #load;
  #value = null;
  #timer = null;
  #loadedAt = null;
  #onError;
  #lastError = null;

  constructor({ load, refreshMs = 0, onError = () => {}, fallback = null }) {
    this.#load = load;
    this.refreshMs = refreshMs;
    this.#onError = onError;
    this.fallback = fallback;
  }

  get current() {
    return this.#value ?? this.fallback;
  }

  get loadedAt() {
    return this.#loadedAt;
  }

  get lastError() {
    return this.#lastError;
  }

  async init({ required = false } = {}) {
    try {
      this.#value = await this.#load();
      this.#loadedAt = new Date();
      this.#lastError = null;
    } catch (error) {
      this.#lastError = error;
      this.#onError(error);
      if (required && this.fallback === null) throw error;
    }
    this.#startTimer();
    return this.current;
  }

  #startTimer() {
    if (this.refreshMs > 0 && !this.#timer) {
      this.#timer = setInterval(() => {
        this.refresh().catch(() => {});
      }, this.refreshMs);
      this.#timer.unref?.();
    }
  }

  async refresh() {
    try {
      const next = await this.#load();
      this.#value = next;
      this.#loadedAt = new Date();
      this.#lastError = null;
      return next;
    } catch (error) {
      this.#lastError = error;
      this.#onError(error);
      return this.current;
    }
  }

  close() {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }
}

export async function fetchJson(url, { fetchImpl = globalThis.fetch, timeoutMs = 5000, headers = {}, method = 'GET', body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method,
      signal: controller.signal,
      headers: { accept: 'application/json', ...headers },
      body,
    });
    if (!response.ok) {
      const error = new Error(`${method} ${url} returned HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
