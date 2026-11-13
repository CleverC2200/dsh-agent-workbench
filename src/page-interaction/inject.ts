export function injectPicker(html: string, script: string): string {
  const tag = `<script data-dsh-page-picker>${script.replace(/<\/script/gi, '<\\/script')}</script>`;
  return html + tag;
}
