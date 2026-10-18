/** Shared page action runtime. Business hosts supply their own page adapters and policies. */
export { AGUI_EVENT_TOOL_CALL_ARGS, AGUI_EVENT_TOOL_CALL_END, AGUI_EVENT_TOOL_CALL_START, PAGE_BRIDGE_LIMITS, validateToolMessages, type AgUiEvent, type AgUiToolCallArgsEvent, type AgUiToolCallEndEvent, type AgUiToolCallStartEvent, type AgUiToolMessage, } from '../page-interaction/page-bridge/protocol.ts';
export { createPageBridge, type PageBridge, type PageBridgeOptions } from './host.ts';
export { compilePageCatalog, validatePageCatalog, PAGE_CATALOG_LIMITS, type PageAction, type PageActionParam, type PageCatalog, } from './catalog.ts';
export { createPageToolRegistry, type PageToolConsumer, type PageToolRegistry, } from './registry.ts';
