/** Resource selection borrows the host Session/Conversation; it owns no current Session. */
export interface NativeResourceSelection {
 fetch: typeof fetch;
 create(options:{cwd:string}):Promise<string>;
 select(sessionId:string,preset:string):Promise<void>;
 open(sessionId:string,skill:string|undefined,signal:AbortSignal):Promise<void>;
}
export interface ResourceSummary {id:string;label:string;kind:'prompt'|'skill';installed:boolean;enabled:boolean;provider:string;skills?:string[];missingSkills?:string[];error?:string}
export async function selectResource(host:NativeResourceSelection,id:string,signal:AbortSignal):Promise<void> {
 const configResponse=await host.fetch('/api/agent-workbench/config',{signal,cache:'no-store'});
 if(!configResponse.ok)throw Error('WORKBENCH_WORKSPACE_UNAVAILABLE');
 const config=await configResponse.json() as {cwd?:unknown};
 if(typeof config.cwd!=='string'||!config.cwd.trim())throw Error('WORKBENCH_WORKSPACE_REQUIRED');
 const response=await host.fetch('/api/agent-manage/resources/select',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id}),signal});
 const resource=await response.json() as {preset?:unknown;skill?:unknown;error?:string};
 if(!response.ok||typeof resource.preset!=='string')throw Error(resource.error??'RESOURCE_SELECTION_FAILED');
 signal.throwIfAborted();
 const sessionId=await host.create({cwd:config.cwd});
 signal.throwIfAborted();
 await host.select(sessionId,resource.preset);signal.throwIfAborted();
 await host.open(sessionId,typeof resource.skill==='string' ? resource.skill : undefined,signal);
}
