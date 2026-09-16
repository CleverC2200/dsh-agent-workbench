/**
 * 中文：为 TypeScript 声明 CSS Modules 的导入形状。
 * 业务组件导入 `*.module.css` 时会得到“局部类名 -> 构建后类名”的只读式映射视图；
 * 本文件仅提供类型信息，不会生成运行时代码。
 */
declare module "*.module.css" {
  /** 中文：构建工具为 CSS Modules 导出的类名映射表。 */
  const classes: Record<string, string>;
  export default classes;
}
