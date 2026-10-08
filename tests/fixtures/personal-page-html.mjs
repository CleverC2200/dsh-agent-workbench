import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
const source=resolve('business/inventory-personal/source/inventory-light-plugins');
const require=createRequire(resolve('package.json'));
let result;
/** Offline regression for UI intent and draft behavior, with fixed facts at the source-input seam. */
export function personalFixtureHtml(){
 return result??=(async()=>{
  const output=await build({entryPoints:[resolve(source,'src/personal/entry.tsx')],outfile:'inventory-personal.js',bundle:true,write:false,minify:true,platform:'browser',format:'iife',jsx:'automatic',target:['chrome110','safari16'],loader:{'.module.css':'local-css'},plugins:[{name:'fixed-personal-input',setup(api){
   api.onResolve({filter:/\/live-input$|^\.\/live-input$/},()=>({path:'fixed-input',namespace:'fixture'}));
   api.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export {loadDailyReportInput,catalog,load,clearReadCache,readSignal} from ${JSON.stringify(resolve(source,'src/personal/mock-input.ts'))};export const dataMode="GEA_LIVE_READONLY";`,resolveDir:source}));
   api.onResolve({filter:/^react(?:\/|$)|^react-dom(?:\/|$)/},a=>({path:require.resolve(a.path)}));
   api.onResolve({filter:/^dsh-agent-manage\/inventory-compute\/[a-z-]+$/},a=>({path:resolve('../dsh-agent-manage/src/inventory-compute',a.path.split('/').at(-1)+'.ts')}));
  }}]});
  const js=output.outputFiles.find(x=>x.path.endsWith('.js')).text;
  const html=await readFile('lib/business/inventory-personal/index.html','utf8');
  return html.replace(/<script>[\s\S]*?<\/script>/,()=>'<script>'+js.replaceAll('</script','<\\/script')+'</script>');
 })();
}
