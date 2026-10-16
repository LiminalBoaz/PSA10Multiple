/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** "owner/repo" for the Add card link; set in CI. */
  readonly VITE_REPO?: string;
}
