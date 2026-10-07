/** Add presentation-only theme projection to a trusted package document. */
export function presentHtml(html: string, css: string): string {
  const bridge = `<style data-workbench-theme>${css}</style><script>window.addEventListener('message',function(event){if(event.source!==parent||event.data?.protocol!=='agent-workbench-theme')return;const value=event.data;if(document.body)document.body.toggleAttribute('data-ds-dark-theme',value.dark===true);if(Number.isFinite(value.fontSize))document.documentElement.style.setProperty('--dsh-content-font-size',String(value.fontSize)+'px');});document.addEventListener('DOMContentLoaded',function(){parent.postMessage({protocol:'agent-workbench-theme',type:'ready'},'*');});</script>`;
  // Generated documents may omit head. Content before their doctype would
  // enable quirks mode and make case-distinct CSS module classes collide.
  const headEnd = html.search(/<\/head\s*>/i);
  const closing = headEnd < 0 ? html.toLowerCase().lastIndexOf("</body>") : headEnd;
  return closing < 0
    ? html + bridge
    : html.slice(0, closing) + bridge + html.slice(closing);
}
