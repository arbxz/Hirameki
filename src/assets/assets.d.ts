// Let TypeScript treat audio asset imports as URL strings (Vite resolves them
// to fingerprinted asset URLs at build time).
declare module "*.mp3" {
  const src: string;
  export default src;
}
declare module "*.wav" {
  const src: string;
  export default src;
}
declare module "*.ogg" {
  const src: string;
  export default src;
}
