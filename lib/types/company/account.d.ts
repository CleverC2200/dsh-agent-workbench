/** A read-only view of GEA's sole Host identity and its explicit login actions. */
export interface BusinessAccount {
    getSnapshot(): Readonly<{
        state: string;
        scope: string | null;
        status: Readonly<{
            authenticated: boolean;
            user: {
                name?: string;
                avatar?: string;
            } | null;
        }> | null;
        error?: string;
    }>;
    subscribe(listener: () => void): () => void;
    startLogin(signal: AbortSignal): Promise<{
        loginId: string;
        image: string;
        expiresIn: number;
    }>;
    pollLogin(loginId: string, signal: AbortSignal): Promise<boolean>;
    logout(signal: AbortSignal): Promise<void>;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        businessAccount: BusinessAccount;
    }
}
