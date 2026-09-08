import 'server-only';

import { HttpError } from '@/lib/auth/guard';

export type ActionState = { ok: boolean; error?: string; message?: string };

/** Turns thrown domain errors into a message a form can render. */
export async function runAction(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const message = await fn();
    return { ok: true, message: message ?? undefined };
  } catch (e) {
    if (e instanceof HttpError) return { ok: false, error: e.message };
    if (e instanceof Error) {
      // Next's redirect() throws a control-flow error that must propagate.
      if ((e as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw e;
      return { ok: false, error: e.message };
    }
    return { ok: false, error: 'Something went wrong' };
  }
}
