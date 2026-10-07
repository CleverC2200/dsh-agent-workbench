import ts from "typescript";
import {resolve} from "node:path";
const root=resolve(import.meta.dirname,"..");
const ui=resolve(root,"business/inventory-qll/source/inventory-light-plugins");
const options={noEmit:true,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,allowJs:true,allowImportingTsExtensions:true,skipLibCheck:true,esModuleInterop:true,strictNullChecks:true,baseUrl:root,paths:{react:[resolve(root,"node_modules/@types/react")],"react/*":[resolve(root,"node_modules/@types/react/*")],"react-dom":[resolve(root,"node_modules/@types/react-dom")],"react-dom/*":[resolve(root,"node_modules/@types/react-dom/*")],"@business-page":[resolve(ui,"src/pages/qll.tsx")],"@business-style":[resolve(ui,"src/dsh-ui/base.css")]}};
const program=ts.createProgram([resolve(ui,"src/types.d.ts"),resolve(ui,"src/native/entry.tsx")],options);
const diagnostics=ts.getPreEmitDiagnostics(program);
console.log(ts.formatDiagnostics(diagnostics,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>root,getNewLine:()=>"\n"}));
console.log(`${diagnostics.length} diagnostics`);process.exitCode=diagnostics.length?1:0;
