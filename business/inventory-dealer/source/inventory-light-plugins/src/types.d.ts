declare module '*.module.css' {
  const styles: Record<string, string>;
  export default styles;
}
declare module '@business-page' {
  const Page: import('react').ComponentType;
  export default Page;
}
