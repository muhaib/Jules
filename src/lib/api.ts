import 'server-only';

import { NextResponse } from 'next/server';
import { ZodError, type ZodSchema } from 'zod';

import { HttpError } from '@/lib/auth/guard';

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status });
}

/**
 * Wraps a route handler so domain errors become the right status code and
 * unexpected errors never leak a stack trace to the client.
 */
export function route<Args extends unknown[]>(
  handler: (req: Request, ...args: Args) => Promise<Response>,
) {
  return async (req: Request, ...args: Args): Promise<Response> => {
    try {
      return await handler(req, ...args);
    } catch (e) {
      if (e instanceof HttpError) return fail(e.status, e.message);
      if (e instanceof ZodError) {
        return fail(422, 'Validation failed', {
          issues: e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
      }
      console.error('[api]', e);
      return fail(500, 'Internal server error');
    }
  };
}

export async function parseJson<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON');
  }
  return schema.parse(body);
}

/** Cursor-free pagination: page/pageSize with sane bounds. */
export function pagination(url: URL, defaultSize = 25, maxSize = 200) {
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
  const pageSize = Math.min(maxSize, Math.max(1, Number(url.searchParams.get('pageSize') ?? defaultSize) || defaultSize));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
