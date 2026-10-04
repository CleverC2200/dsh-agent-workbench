// src/page-interaction/inject.ts
function injectPicker(html, script) {
  const tag = `<script data-dsh-page-picker>${script.replace(/<\/script/gi, "<\\/script")}<\/script>`;
  const closing = html.toLowerCase().lastIndexOf("</body>");
  return closing < 0 ? html + tag : html.slice(0, closing) + tag + html.slice(closing);
}
export {
  injectPicker
};
