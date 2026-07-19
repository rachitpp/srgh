/// <reference types="vite/client" />

// Declares the env vars this app actually reads, so `import.meta.env.VITE_API_BASE`
// is a typed `string | undefined` instead of falling through to Vite's catch-all
// `any` index signature.
interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
