/** Installed pages read the adjacent config injected by the Host, not a bundled copy. */
export function sqlConfigPlugin() {
  return {
    name: 'installed-agent-sql-config',
    setup(api) {
      api.onLoad({ filter: /[/\\]sql\.config\.json$/ }, () => ({
        loader: 'js',
        contents: `const element=document.getElementById('agent-sql-config');
if(!element)throw Error('缺少Agent SQL配置，请通过工作台或本地直连预览打开页面');
export default JSON.parse(element.textContent);`,
      }));
    },
  };
}
