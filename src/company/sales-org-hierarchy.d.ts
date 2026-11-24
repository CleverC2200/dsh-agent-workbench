declare module 'dsh-agent-manage/aps-compute/sales-org-hierarchy' {
  export type SalesOrgNode = {
    name: string;
    children?: SalesOrgNode[];
  };

  export const salesOrgHierarchy: SalesOrgNode[];
}

declare module 'dsh-agent-manage/aps-compute/base-product-hierarchy' {
  export const baseProductHierarchy: readonly {
    name: string;
    items: readonly { name: string; materials: readonly string[] }[];
  }[];
}
