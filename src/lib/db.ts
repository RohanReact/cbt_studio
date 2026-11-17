import { openDB, type DBSchema } from 'idb';
import { api } from './api';
import type { Attempt, Paper, StoredFile } from './types';

interface Cache extends DBSchema {
  files: { key: string; value: StoredFile & { ownerId: string } };
}

const cachePromise = openDB<Cache>('cbt-cache', 1, {
  upgrade(db) {
    db.createObjectStore('files', { keyPath: 'id' });
  },
});

let cacheOwner: string | null = null;

export function setCacheOwner(id: string | null) {
  cacheOwner = id;
}

export async function clearFileCache() {
  await (await cachePromise).clear('files');
}

async function remember(file: StoredFile) {
  if (!cacheOwner) return;
  await (await cachePromise).put('files', { ...file, ownerId: cacheOwner });
}

export const db = {
  papers: () => api.papers(),
  paper: (id: string) => api.paper(id),
  savePaper: (paper: Paper) => api.savePaper(paper),
  deletePaper: async (id: string) => {
    const paper = await api.paper(id);
    await api.deletePaper(id);
    if (!paper) return;
    const cache = await cachePromise;
    await Promise.all(paper.files.map((file) => cache.delete('files', file.id)));
  },

  async file(id: string) {
    if (cacheOwner) {
      const hit = await (await cachePromise).get('files', id);
      if (hit?.ownerId === cacheOwner) return { id: hit.id, name: hit.name, data: hit.data };
    }
    const file = await api.file(id);
    if (file) await remember(file);
    return file;
  },
  async saveFile(file: StoredFile) {
    await api.saveFile(file);
    await remember(file);
  },

  attempt: (id: string) => api.attempt(id),
  saveAttempt: (attempt: Attempt) => api.saveAttempt(attempt),
  attemptsFor: (paperId: string) => api.attemptsFor(paperId),
  allAttempts: () => api.attempts(),
  deleteAttempt: (id: string) => api.deleteAttempt(id),
};
