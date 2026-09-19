/**
 * Reading a request body is the one thing an adapter cannot do generically,
 * because each framework owns the stream. These helpers are only ever called
 * for a POST to the inquiry path, so no other request is touched.
 */
const MAX_BODY_BYTES = 64 * 1024;

export async function readNodeBody(req, limit = MAX_BODY_BYTES) {
  // Something upstream (body-parser, express.json) may already have consumed
  // and parsed it.
  if (req.body !== undefined && req.body !== null) return req.body;
  if (req.readableEnded || req.complete) return '';

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error('request body too large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function readWebBody(request, limit = MAX_BODY_BYTES) {
  const text = await request.text();
  return text.length > limit ? text.slice(0, limit) : text;
}
