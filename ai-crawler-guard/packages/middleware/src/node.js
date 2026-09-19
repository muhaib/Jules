/**
 * Adapter for plain node:http / node:https servers.
 *
 * This is also the adapter a reverse proxy would use: the engine only needs
 * the request line, the headers and the socket address, all of which a proxy
 * has before it decides whether to forward anything upstream.
 */
import { readNodeBody } from './body.js';

export function writeNodeResponse(res, response) {
  res.statusCode = response.status;
  for (const [name, value] of Object.entries(response.headers ?? {})) {
    res.setHeader(name, value);
  }
  if (res.req?.method === 'HEAD') {
    res.end();
    return;
  }
  res.end(response.body ?? '');
}

export function toRequestDescriptor(req) {
  return {
    method: req.method,
    url: req.url,
    headers: req.headers,
    socketIp: req.socket?.remoteAddress,
    readBody: () => readNodeBody(req),
  };
}

/**
 * @returns {(req, res) => Promise<boolean>} true when the response has been
 * written and the caller should stop.
 */
export function createNodeHandler(guard, { onError = () => {} } = {}) {
  return async function handle(req, res) {
    try {
      const decision = await guard.inspect(toRequestDescriptor(req));
      if (!decision.response) return false;
      writeNodeResponse(res, decision.response);
      return true;
    } catch (error) {
      // A failure in the guard must not take the site down with it.
      onError(error);
      return false;
    }
  };
}
