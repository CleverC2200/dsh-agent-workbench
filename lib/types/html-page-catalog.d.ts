/** Pages publish elements; GEA owns the surface/tool identity and validates their data. */
export declare function htmlPageCatalog(input: {
    surface: string;
    tool: string;
    label: string;
    elements: unknown;
}): {
    surface: string;
    tool: string;
    reasonField: string;
    description: string;
    elements: any[];
} | null;
