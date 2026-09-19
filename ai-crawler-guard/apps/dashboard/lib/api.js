import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/**
 * Server-side read. The browser's session cookie is forwarded so the API
 * applies the same ownership checks it would for a direct request; nothing is
 * trusted from the dashboard process itself.
 */
export async function apiGet(path, { allow404 = false } = {}) {
  const jar = await cookies();
  const response = await fetch(`${API_URL}${path}`, {
    headers: { cookie: jar.toString() },
    cache: 'no-store',
  });
  if (response.status === 401) redirect('/login');
  if (response.status === 404 && allow404) return null;
  if (!response.ok) {
    throw new Error(`API ${path} failed: ${response.status} ${await response.text()}`);
  }
  const type = response.headers.get('content-type') ?? '';
  return type.includes('application/json') ? response.json() : response.text();
}

export async function currentUser() {
  const jar = await cookies();
  const response = await fetch(`${API_URL}/auth/me`, {
    headers: { cookie: jar.toString() },
    cache: 'no-store',
  });
  if (!response.ok) return null;
  return (await response.json()).user;
}
