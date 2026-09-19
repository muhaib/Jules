/**
 * Fastify plugin.
 *
 * Runs in `onRequest` so a blocked crawler never reaches routing, body
 * parsing or any route handler. The inquiry POST is the exception: it needs a
 * body, so it is handled in `preHandler` where Fastify has already parsed one.
 */
export function fastifyAiCrawlerGuard(fastify, options, done) {
  const guard = options.guard;
  const onError = options.onError ?? fastify.log.error.bind(fastify.log);
  if (!guard) {
    done(new Error('fastifyAiCrawlerGuard requires { guard }'));
    return;
  }

  const inquiryPath = guard.paths.inquiry;

  const describe = (request) => ({
    method: request.method,
    url: request.url,
    headers: request.headers,
    socketIp: request.socket?.remoteAddress ?? request.raw?.socket?.remoteAddress,
    body: request.body,
  });

  const send = (decision, reply) => {
    reply
      .code(decision.response.status)
      .headers(decision.response.headers ?? {})
      .send(decision.response.body);
  };

  fastify.decorateRequest('aiCrawler', null);

  fastify.addHook('onRequest', async (request, reply) => {
    if (request.method === 'POST' && request.url.split('?')[0] === inquiryPath) return;
    try {
      const decision = await guard.inspect(describe(request));
      request.aiCrawler = decision;
      if (decision.response) send(decision, reply);
    } catch (error) {
      onError(error);
    }
  });

  fastify.addHook('preHandler', async (request, reply) => {
    if (request.method !== 'POST' || request.url.split('?')[0] !== inquiryPath) return;
    try {
      const decision = await guard.inspect(describe(request));
      request.aiCrawler = decision;
      if (decision.response) send(decision, reply);
    } catch (error) {
      onError(error);
    }
  });

  done();
}

// Let Fastify register this at the root scope rather than in a child context,
// so the hooks apply to every route.
fastifyAiCrawlerGuard[Symbol.for('skip-override')] = true;
fastifyAiCrawlerGuard[Symbol.for('fastify.display-name')] = 'ai-crawler-guard';
