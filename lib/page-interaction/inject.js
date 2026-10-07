// src/page-interaction/inject.ts
function injectPicker(html, script) {
  const tag = `<script data-dsh-page-picker>${script.replace(/<\/script/gi, "<\\/script")}<\/script>`;
  return html + tag;
}
export {
  injectPicker
};
