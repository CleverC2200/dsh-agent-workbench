export type BusinessEnvironment = 'production' | 'test';

/** A read-only view of GEA's sole Host identity and its explicit login actions. */
export interface BusinessAccount {
  getSnapshot(): Readonly<{
    state: string;
    scope: string | null;
    subject?: string | null;
    status: Readonly<{
      environment: BusinessEnvironment;
      environments: readonly string[];
      authenticated: boolean;
      loginState?: string;
      user: { name?: string; avatar?: string } | null;
    }> | null;
    error?: string;
  }>;
  refreshIdentity(signal?: AbortSignal): Promise<string | null>;
  subscribe(listener: () => void): () => void;
  startLogin(
    signal: AbortSignal,
    environment: BusinessEnvironment,
  ): Promise<{ loginId: string; image: string; expiresIn: number }>;
  pollLogin(loginId: string, signal: AbortSignal): Promise<boolean>;
  logout(signal: AbortSignal): Promise<void>;
}
declare module '@deepseek-ai/cordis' {
  interface Context {
    businessAccount: BusinessAccount;
  }
}
