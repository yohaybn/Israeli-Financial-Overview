/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_DEMO?: string;
    /** Set at build time (CI, Docker, packaging). Shown in the feedback form prefill. */
    readonly VITE_APP_BUILD_VERSION: string;
    /** e.g. docker, windows, github-pages — baked in at build; see vite.config.ts */
    readonly VITE_INSTALL_KIND: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
