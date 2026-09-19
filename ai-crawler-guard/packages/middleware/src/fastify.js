/**
 * Fastify plugin.
 *
 * Everything runs in `onRequest`, which is before routing and before body
 * parsing, so a blocked crawler never reaches a route handler and the
 * licensing form works whatever content types the application has registered.
 *
 * That last part is why the inquiry body is read from `request.raw` rather
 * than `request.body`: Fastify ships a JSON parser and nothing else, so an
 * `application/x-www-form-urlencoded` POST - which is exactly what the
 * licensing page submits - arrives unparsed unless the application happens to
 * have registered @fastify/formbody. Reading the raw stream ourselves removes
 * that dependency. `onRequest` is the only hook early enough to do it safely.
 */
import { readNodeBody } from './body.js';

export function fastifyAiCrawlerGuard(fastify, options, done) {
  const guard = options.guard;
  const onError = options.onError ?? fastify.log.error.bind(fastify.log);
  if (!guard) {
    done(new Error('fastifyAiCrawlerGuard requires { guard }'));
    return;
  }

  const inquiryPath = guard.paths.inquiry;

  fastify.decorateRequest('aiCrawler', null);

  fastify.addHook('onRequest', async (request, reply) => {
    const isInquiry = request.method === 'POST' && request.url.split('?')[0] === inquiryPath;
    try {
      const decision = await guard.inspect({
        method: request.method,
        url: request.url,
        headers: request.headers,
        socketIp: request.socket?.remoteAddress ?? request.raw?.socket?.remoteAddress,
        // Only the inquiry endpoint needs a body, and it is the one request
        // the guard always answers itself, so the stream is never consumed
        // out from under a route handler.
        readBody: isInquiry ? () => readNodeBody(request.raw) : undefined,
      });
      request.aiCrawler = decision;
      if (decision.response) {
        reply
          .code(decision.response.status)
          .headers(decision.response.headers ?? {})
          .send(decision.response.body);
      }
    } catch (error) {
      onError(error);
    }
  });

  done();
}

// Register at the root scope rather than in a child context, so the hook
// applies to every route.
fastifyAiCrawlerGuard[Symbol.for('skip-override')] = true;
fastifyAiCrawlerGuard[Symbol.for('fastify.display-name')] = 'ai-crawler-guard';
