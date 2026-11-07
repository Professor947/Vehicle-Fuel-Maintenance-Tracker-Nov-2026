import { randomUUID } from 'expo-crypto';
import { addDatabaseChangeListener } from 'expo-sqlite';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { db } from '@/db/client';
import { createRepo, type Repo } from '@/db/repo';

const Ctx = createContext<Repo | null>(null);

export function RepoProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const repo = useMemo(() => createRepo({ db, userId, newId: randomUUID }), [userId]);
  return <Ctx.Provider value={repo}>{children}</Ctx.Provider>;
}

export function useRepo(): Repo {
  const r = useContext(Ctx);
  if (!r) throw new Error('useRepo outside RepoProvider');
  return r;
}

/** Bumps on every write to the local DB (ours or sync's). */
function useDbVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    let pending = false;
    const sub = addDatabaseChangeListener(() => {
      if (pending) return;
      pending = true;
      // Coalesce bursts (a transaction touches several rows).
      requestAnimationFrame(() => {
        pending = false;
        setV((x) => x + 1);
      });
    });
    return () => sub.remove();
  }, []);
  return v;
}

/** Synchronous repo read that re-runs whenever the local DB changes. */
export function useLive<T>(read: (repo: Repo) => T, deps: unknown[]): T {
  const repo = useRepo();
  const version = useDbVersion();
  // deps are primitives (ids, tab names); a string key keeps the dependency list static.
  const key = JSON.stringify(deps);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => read(repo), [repo, version, key]);
}
