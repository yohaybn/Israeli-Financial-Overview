import type { GlobalScrapeConfig } from '@app/shared';

type FraudDetectionPatch = Partial<GlobalScrapeConfig['postScrapeConfig']['fraudDetection']>;

const FRAUD_PATCH_EVENT = 'config-fraud-patch';

export function mergeFraudDetectionConfig(config: GlobalScrapeConfig, patch: FraudDetectionPatch): GlobalScrapeConfig {
    return {
        ...config,
        postScrapeConfig: {
            ...config.postScrapeConfig,
            fraudDetection: {
                ...config.postScrapeConfig.fraudDetection,
                ...patch,
            },
        },
    };
}

export function emitFraudDetectionPatch(patch: FraudDetectionPatch): void {
    window.dispatchEvent(new CustomEvent<FraudDetectionPatch>(FRAUD_PATCH_EVENT, { detail: patch }));
}

export function subscribeFraudDetectionPatch(
    listener: (patch: FraudDetectionPatch) => void
): () => void {
    const onEvent = (event: Event) => {
        const custom = event as CustomEvent<FraudDetectionPatch>;
        if (!custom.detail || typeof custom.detail !== 'object') return;
        listener(custom.detail);
    };
    window.addEventListener(FRAUD_PATCH_EVENT, onEvent as EventListener);
    return () => window.removeEventListener(FRAUD_PATCH_EVENT, onEvent as EventListener);
}
