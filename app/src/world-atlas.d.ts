// контуры стран (world-atlas, TopoJSON) для глобуса в GdpDemo.tsx
declare module "world-atlas/countries-110m.json" {
  const topology: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export default topology;
}
