/**
 * The API serves the crawler catalog to every middleware instance, which is
 * how a signature update reaches deployed sites without anyone redeploying.
 * It is the same file the npm package ships, unless CRAWLERS_FILE points
 * somewhere else.
 */
import { readFile } from 'node:fs/promises';
import { CatalogStore, compileCatalog, defaultCatalogSource } from '@ai-crawler-guard/core';

let store = null;
let raw = null;

export async function loadCatalog() {
  if (store) return store.current;
  const file = process.env.CRAWLERS_FILE;
  raw = file ? JSON.parse(await readFile(file, 'utf8')) : defaultCatalogSource();
  compileCatalog(raw); // fail fast at boot rather than on the first request
  store = new CatalogStore({ source: raw });
  await store.load();
  return store.current;
}

export function catalog() {
  if (!store) throw new Error('catalog not loaded; call loadCatalog() during startup');
  return store.current;
}

/** The exact document the middleware fetches from /v1/crawlers. */
export function catalogDocument() {
  return raw;
}
