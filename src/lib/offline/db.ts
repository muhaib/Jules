'use client';

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

/**
 * Local store for field work. An inspector downloads an assigned inspection,
 * answers it with no connectivity, and everything is replayed to the server when
 * the device comes back online.
 */
export type CachedInspection = {
  id: string;
  reference: string;
  branchName: string;
  branchCode: string;
  templateName: string;
  scheduledFor: string;
  status: string;
  categories: {
    name: string;
    items: {
      responseId: string;
      checklistItemId: string;
      text: string;
      guidance: string | null;
      isMandatory: boolean;
      requirePhotoOnFail: boolean;
      defaultSeverity: string;
      result: string | null;
      observation: string | null;
      comment: string | null;
      severity: string | null;
      evidenceCount: number;
    }[];
  }[];
  downloadedAt: number;
};

export type QueuedAnswer = {
  /** `${inspectionId}:${responseId}` — one queued row per response, last write wins. */
  key: string;
  inspectionId: string;
  responseId: string;
  result: string | null;
  observation: string | null;
  comment: string | null;
  severity: string | null;
  latitude: number | null;
  longitude: number | null;
  answeredAt: string;
  updatedAt: number;
};

export type QueuedPhoto = {
  key: string;
  inspectionId: string;
  responseId: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
  caption: string | null;
  latitude: number | null;
  longitude: number | null;
  capturedAt: string;
  createdAt: number;
};

interface BranchCheckDB extends DBSchema {
  inspections: { key: string; value: CachedInspection };
  answers: { key: string; value: QueuedAnswer; indexes: { byInspection: string } };
  photos: { key: string; value: QueuedPhoto; indexes: { byInspection: string; byResponse: string } };
  meta: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<BranchCheckDB>> | null = null;

export function db() {
  if (typeof window === 'undefined') {
    throw new Error('The offline store is only available in the browser');
  }
  if (!dbPromise) {
    dbPromise = openDB<BranchCheckDB>('branchcheck', 1, {
      upgrade(database) {
        database.createObjectStore('inspections', { keyPath: 'id' });

        const answers = database.createObjectStore('answers', { keyPath: 'key' });
        answers.createIndex('byInspection', 'inspectionId');

        const photos = database.createObjectStore('photos', { keyPath: 'key' });
        photos.createIndex('byInspection', 'inspectionId');
        photos.createIndex('byResponse', 'responseId');

        database.createObjectStore('meta');
      },
    });
  }
  return dbPromise;
}

export async function cacheInspection(inspection: CachedInspection) {
  const d = await db();
  await d.put('inspections', inspection);
}

export async function getCachedInspection(id: string) {
  const d = await db();
  return d.get('inspections', id);
}

export async function listCachedInspections() {
  const d = await db();
  return d.getAll('inspections');
}

export async function removeCachedInspection(id: string) {
  const d = await db();
  await d.delete('inspections', id);
}

export async function queueAnswer(answer: Omit<QueuedAnswer, 'key' | 'updatedAt'>) {
  const d = await db();
  await d.put('answers', {
    ...answer,
    key: `${answer.inspectionId}:${answer.responseId}`,
    updatedAt: Date.now(),
  });
}

export async function queuePhoto(photo: Omit<QueuedPhoto, 'key' | 'createdAt'>) {
  const d = await db();
  const key = `${photo.responseId}:${crypto.randomUUID()}`;
  await d.put('photos', { ...photo, key, createdAt: Date.now() });
  return key;
}

export async function queuedPhotosFor(responseId: string) {
  const d = await db();
  return d.getAllFromIndex('photos', 'byResponse', responseId);
}

export async function removeQueuedPhoto(key: string) {
  const d = await db();
  await d.delete('photos', key);
}
