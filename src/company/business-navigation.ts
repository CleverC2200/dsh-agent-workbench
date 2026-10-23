export interface BusinessNavigationAgent {
  readonly id: string;
  readonly agentCode: string | null;
  readonly agentName: string | null;
  readonly businessDomain: string | null;
}

export interface BusinessNavigationDomain {
  readonly value: string;
  readonly text: string;
  readonly description: string | null;
}

export type BusinessNavigationDomains =
  | { readonly kind: 'available'; readonly items: readonly BusinessNavigationDomain[] }
  | { readonly kind: 'unavailable'; readonly message: string };

export interface BusinessNavigationCatalog {
  readonly agents: readonly BusinessNavigationAgent[];
  readonly domains: BusinessNavigationDomains;
}

export interface BusinessNavigation {
  read(signal: AbortSignal): Promise<BusinessNavigationCatalog>;
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    businessNavigation: BusinessNavigation;
  }
}
