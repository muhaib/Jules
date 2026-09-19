/** Express / Connect adapter. */
import { toRequestDescriptor, writeNodeResponse } from './node.js';

export function createExpressMiddleware(guard, { onError = () => {} } = {}) {
  return async function aiCrawlerGuard(req, res, next) {
    try {
      const decision = await guard.inspect(toRequestDescriptor(req));
      // Downstream handlers and templates can read this, e.g. to serve a
      // reduced page to an allowed crawler.
      res.locals = res.locals ?? {};
      res.locals.aiCrawler = decision;
      req.aiCrawler = decision;
      if (decision.response) {
        writeNodeResponse(res, decision.response);
        return undefined;
      }
      return next();
    } catch (error) {
      onError(error);
      return next();
    }
  };
}
