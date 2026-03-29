/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VERIFIER_HOST?: string;
  readonly VITE_SSL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
