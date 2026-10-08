import { type StoredReference } from './reference-domain.ts';
export declare function apply(ctx: any, options?: {
    authorize?: (input: unknown) => string;
    authorizeRead?: (snapshot: StoredReference) => void;
}): () => void;
