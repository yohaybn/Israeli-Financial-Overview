/// <reference types="vite/client" />

declare global {
    interface Window {
        electronDesktop?: {
            getCloseToTray: () => Promise<boolean>;
            setCloseToTray: (value: boolean) => Promise<boolean>;
            onCloseToTrayChanged: (listener: (value: boolean) => void) => () => void;
        };
    }
}

export {};

interface ImportMetaEnv {
    readonly VITE_DEMO?: string;
    /** Set at build time (CI, Docker, packaging). Shown in the feedback form prefill. */
    readonly VITE_APP_BUILD_VERSION: string;
    /** e.g. docker, windows, github-pages — baked in at build; see vite.config.ts */
    readonly VITE_INSTALL_KIND: string;
    /** `owner/repo` for GitHub release check (Maintenance). Default in vite.config.ts */
    readonly VITE_GITHUB_REPO: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
