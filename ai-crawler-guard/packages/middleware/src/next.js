/**
 * Next.js adapter, for `middleware.ts` or a route handler.
 *
 * Runtime caveat, and it is a real one: Next middleware defaults to the Edge
 * runtime, where `node:dns` does not exist. Reverse-DNS verification cannot
 * run there. Either opt the middleware into the Node.js runtime:
 *
 *   export const config = { runtime: 'nodejs' }
 *
 * or accept that every verification comes back `unknown` and set your policy's
 * `onUnknown` accordingly. The adapter does not pretend otherwise - an
 * unavailable resolver produces `unknown`, never a false `verified`.
 */
import { readWebBody } from './body.js';

function headersToObject(headers) {
  const out = {};
  for (const [key, value] of headers.entries()) out[key] = value;
  return out;
}

export function toWebRequestDescriptor(request, { ip } = {}) {
  return {
    method: request.method,
    url: request.nextUrl?.pathname ?? request.url,
    headers: request.headers,
    socketIp: ip ?? request.ip ?? undefined,
    readBody: () => readWebBody(request),
  };
}

function toWebResponse(response) {
  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
}

/**
 * @returns {(request: Request) => Promise<Response|null>} a Response when the
 * request was handled, or null to continue (`NextResponse.next()`).
 */
export function createNextMiddleware(guard, { onError = () => {}, ip } = {}) {
  return async function aiCrawlerGuard(request) {
    try {
      const decision = await guard.inspect(toWebRequestDescriptor(request, { ip: ip?.(request) }));
      return decision.response ? toWebResponse(decision.response) : null;
    } catch (error) {
      onError(error);
      return null;
    }
  };
}
