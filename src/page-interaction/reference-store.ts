import { randomUUID } from "node:crypto";
import {
  pageReference,
  type BoundReference,
  type ReferenceReceipt,
} from "./reference.ts";
import type { KvTable } from '@deepseek-ai/dsh-storage-domain';
import { storedReferenceSchema, type StoredReference } from './reference-domain.ts';

/** Core owns durability; the conversation only carries a small receipt. */
export function createReferenceStore(table: Pick<KvTable<string, StoredReference>, 'get' | 'put'>) {
  let closed = false;
  return {
    async put(input: unknown, principal: string): Promise<ReferenceReceipt> {
      const data = input as Partial<BoundReference> | null;
      const snapshot = pageReference(input);
      if (
        closed || !snapshot || !principal ||
        typeof data?.sessionId !== "string" ||
        !/^session-[a-z0-9-]+$/i.test(data.sessionId) ||
        typeof data.surface !== "string"
      )
        throw Error("引用无效，请重新选择。");
      const id = "R" + randomUUID().replace(/-/g, "").slice(0, 12);
      await table.put(id, storedReferenceSchema.parse({
        ...snapshot,
        sessionId: data.sessionId,
        surface: data.surface.slice(0, 200),
        tool:
          typeof data.tool === "string" ? data.tool.slice(0, 100) : undefined,
        principal,
      }));
      if (closed) throw Error('引用未保存，请重新打开页面。');
      return { id, label: `${snapshot.page} · ${snapshot.label}`.slice(0, 72) };
    },
    read(sessionId: string, id: string) {
      const snapshot = closed ? undefined : table.get(id);
      return snapshot?.sessionId === sessionId
        ? snapshot
        : {
            error: "REFERENCE_UNAVAILABLE",
            message: "引用已失效，请在当前页面重新选择内容。",
          };
    },
    dispose() {
      closed = true;
    },
  };
}
