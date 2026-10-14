import type { Context } from '@deepseek-ai/cordis';
import { startInventoryConversation } from './business-conversation.ts';
import type { NativeResourceSelection } from './resource-selection.ts';
import type { WorkbenchController } from './workbench.ts';
type EntryCopyKey = 'inventoryEntry' | 'inventoryEntryHint' | 'inventoryEntryFailed';
/** Public Core input dock; the entry owns only transient creation state. */
export declare function mountInventoryEntry(ctx: Context, workbench: WorkbenchController, resources: () => NativeResourceSelection | undefined, associate: Parameters<typeof startInventoryConversation>[0]['associate'], t: (key: EntryCopyKey) => string): void;
export {};
