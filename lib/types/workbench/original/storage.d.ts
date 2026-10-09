import type { AssistantSurfaceId } from './registry.ts';
export declare const getAssistantSurfaceWorkbenchScope: (stateScope: string) => string;
export declare const getAssistantSurfaceStateScope: (userId: string, surfaceId: AssistantSurfaceId, fixtureEnvironment: boolean) => string;
export declare const readAssistantSurfaceState: <T>(surfaceId: AssistantSurfaceId, scope: string, fallback: T) => T;
export declare const writeAssistantSurfaceState: <T>(surfaceId: AssistantSurfaceId, scope: string, value: T) => void;
