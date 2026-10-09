import { type ReferenceReceipt } from "./reference.ts";
import type { KvTable } from '@deepseek-ai/dsh-storage-domain';
import { type StoredReference } from './reference-domain.ts';
/** Core owns durability; the conversation only carries a small receipt. */
export declare function createReferenceStore(table: Pick<KvTable<string, StoredReference>, 'get' | 'put'>): {
    put(input: unknown, principal: string): Promise<ReferenceReceipt>;
    read(sessionId: string, id: string): StoredReference | {
        error: string;
        message: string;
    };
    dispose(): void;
};
