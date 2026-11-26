import { z } from 'zod';
import { mpsLocalDraftSchema, type MpsLocalState } from './mps-local-draft.ts';

const databaseName = 'agent-workbench.mps-evaluations';
const storeName = 'version-results';

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const count = z.number().int().nonnegative();
const versionKey = z.strictObject({ id: z.string().min(1).max(10000), month });
const plan = z.looseObject({
  status: z.string(),
  months: z.array(month).min(1),
  summary: z.looseObject({ totalRows: count, evaluatedRows: count }),
  rows: z.array(z.unknown()),
  allocations: z.array(z.unknown()),
  resourceSchedules: z.array(z.unknown()),
  transfers: z.array(z.unknown()),
});
const snapshot = z.strictObject({
  format: z.literal(1),
  at: z.string().min(1).max(128),
  inputs: z.string(),
  result: z.strictObject({
    plan,
    categoryComputation: z.strictObject({ festival: z.unknown().optional() }),
  }),
});
const request = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('read'), version: versionKey }),
  z.strictObject({ operation: z.literal('write'), version: versionKey, snapshot }),
]);
const savedInputs = z.object({ format: z.literal(1), inputs: z.string() });

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(databaseName, 1);
    let blocked = false;
    open.onupgradeneeded = () => open.result.createObjectStore(storeName);
    open.onblocked = () => {
      blocked = true;
      reject(Error('MPS_EVALUATION_STORE_BLOCKED'));
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      if (blocked) open.result.close();
      else resolve(open.result);
    };
  });
}

export async function accessMpsEvaluation(account: string, input: unknown) {
  const operation = request.parse(input);
  const key = [account, operation.version.month, operation.version.id];
  const database = await openDatabase();
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const write = operation.operation === 'write';
      const transaction = database.transaction(
        storeName,
        write ? 'readwrite' : 'readonly',
        write ? { durability: 'strict' } : undefined,
      );
      const store = transaction.objectStore(storeName);
      const entry = write ? store.put(operation.snapshot, key) : store.get(key);
      transaction.onabort = () =>
        reject(transaction.error ?? Error('MPS_EVALUATION_STORE_ABORTED'));
      transaction.oncomplete = () => {
        if (write) resolve(null);
        else {
          const restored = snapshot.safeParse(entry.result);
          resolve(restored.success ? restored.data : null);
        }
      };
    });
  } finally {
    database.close();
  }
}

export async function recoverMpsEvaluatedDrafts(
  account: string,
  known: ReadonlySet<string>,
): Promise<MpsLocalState['drafts']> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName);
      const store = transaction.objectStore(storeName);
      const recovered: MpsLocalState['drafts'] = [];
      const keys = store.getAllKeys(IDBKeyRange.bound([account], [account, []]));
      keys.onsuccess = () => {
        for (const key of keys.result) {
          if (!Array.isArray(key) || typeof key[2] !== 'string' || known.has(key[2])) continue;
          const read = store.get(key);
          read.onsuccess = () => {
            const saved = savedInputs.safeParse(read.result);
            if (!saved.success) return;
            try {
              const draft = mpsLocalDraftSchema.safeParse(JSON.parse(saved.data.inputs));
              if (draft.success && draft.data.month === key[1] && draft.data.id === key[2])
                recovered.push(draft.data);
            } catch {
              return;
            }
          };
        }
      };
      transaction.onabort = () =>
        reject(transaction.error ?? Error('MPS_EVALUATION_STORE_ABORTED'));
      transaction.oncomplete = () => resolve(recovered);
    });
  } finally {
    database.close();
  }
}
