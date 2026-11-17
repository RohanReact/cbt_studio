import { openDB, type DBSchema } from 'idb';
import { ApiError, api } from './api';
import type { Attempt, Paper, StoredFile } from './types';

interface Legacy extends DBSchema {
  papers: { key: string; value: Paper };
  files: { key: string; value: StoredFile };
  attempts: { key: string; value: Attempt; indexes: { byPaper: string } };
}

let pending: Promise<number> | null = null;

/** Move papers saved by the earlier browser-only build into the signed-in account. */
export function migrateLocalLibrary() {
  pending ??= run().catch((error) => {
    console.error(error);
    pending = null;
    return 0;
  });
  return pending;
}

async function run() {
  const factory = indexedDB as IDBFactory & { databases?: () => Promise<Array<{ name?: string }>> };
  if (!factory.databases) return 0;
  const existing = await factory.databases();
  if (!existing.some((item) => item.name === 'cbt-studio')) return 0;

  const legacy = await openDB<Legacy>('cbt-studio', 1);
  const papers = await legacy.getAll('papers');
  if (!papers.length) {
    legacy.close();
    indexedDB.deleteDatabase('cbt-studio');
    return 0;
  }

  let moved = 0;
  let blocked = false;
  for (const paper of papers) {
    try {
      for (const meta of paper.files) {
        const file = await legacy.get('files', meta.id);
        if (file) await api.saveFile(file);
      }
      await api.savePaper(paper);
      const attempts = await legacy.getAllFromIndex('attempts', 'byPaper', paper.id);
      for (const attempt of attempts) await api.saveAttempt(attempt);
      moved += 1;
    } catch (error) {
      if (error instanceof ApiError && error.code === 'upgrade_required') {
        blocked = true;
        break;
      }
      console.error(error);
    }
  }

  if (!blocked && moved === papers.length) {
    legacy.close();
    indexedDB.deleteDatabase('cbt-studio');
  } else {
    legacy.close();
  }
  return moved;
}
