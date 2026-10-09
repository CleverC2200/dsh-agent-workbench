import { z } from 'zod';
import type { BoundReference } from './reference.ts';
/** Explicitly selected evidence is a Session sidecar, never a grant or restored page fact. */
export type StoredReference = BoundReference & {
    principal: string;
};
export declare const storedReferenceSchema: z.ZodObject<{
    sessionId: z.ZodString;
    principal: z.ZodString;
    surface: z.ZodString;
    tool: z.ZodOptional<z.ZodString>;
    page: z.ZodString;
    kind: z.ZodOptional<z.ZodEnum<{
        row: "row";
        table: "table";
        block: "block";
    }>>;
    label: z.ZodString;
    text: z.ZodString;
    row: z.ZodOptional<z.ZodString>;
    column: z.ZodOptional<z.ZodString>;
    scope: z.ZodOptional<z.ZodString>;
    targets: z.ZodArray<z.ZodString>;
    capturedAt: z.ZodString;
    truncated: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>;
export declare const referenceDomain: {
    name: string;
    version: number;
    layout: "per-record";
    tables: {
        references: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<string, {
            sessionId: string;
            principal: string;
            surface: string;
            page: string;
            label: string;
            text: string;
            targets: string[];
            capturedAt: string;
            tool?: string | undefined;
            kind?: "row" | "table" | "block" | undefined;
            row?: string | undefined;
            column?: string | undefined;
            scope?: string | undefined;
            truncated?: boolean | undefined;
        }>;
    };
};
