import type { Context } from '@deepseek-ai/cordis';
import type { WorkbenchController } from './workbench.ts';
import type { NativeResourceSelection } from './resource-selection.ts';
import { type PageSessionRestore } from './page-session-coordination.ts';
import type { WorkbenchFramePage } from './frame.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotFactoryMap {
        'agent-workbench.document': {
            scope: 'session-maybe';
            props: {
                page: WorkbenchFramePage;
                active: boolean;
                navigationError?: string;
            };
            children: {
                'agent-workbench.conversation': {
                    kind: 'single';
                    scope: 'session-maybe';
                };
            };
        };
    }
    interface SlotMap {
        'agent-workbench.conversation': {
            kind: 'single';
            scope: 'session-maybe';
            owner: {
                page: string;
            };
        };
    }
}
/** The single native/HTML presentation module. Host Session references are explicitly borrowed. */
export type FrameCopyKey = 'pageConnect' | 'pageNewChat' | 'pageWorking' | 'pageChanged' | 'pageHint' | 'pageWait' | 'pageLogin' | 'pageSessionUnavailable' | 'pageStaticHint' | 'pageCreating' | 'pageInterpreter' | 'pageIdentityFailed';
export declare function mountFramePresentation(ctx: Context, resources: () => NativeResourceSelection | undefined, t: (key: FrameCopyKey) => string, workbench: WorkbenchController): PageSessionRestore;
