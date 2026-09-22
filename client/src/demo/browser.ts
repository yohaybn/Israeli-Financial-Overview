import { setupWorker } from 'msw/browser';

// Load independent demo domains in parallel. This keeps the demo-only MSW runtime
// out of production startup while giving each mock domain a clear bundle boundary.
const [core, ai, integrations, investments, logs, fallback] = await Promise.all([
    import('./handlers/core'),
    import('./handlers/ai'),
    import('./handlers/integrations'),
    import('./handlers/investments'),
    import('./handlers/logs'),
    import('./handlers/fallback'),
]);

export const worker = setupWorker(
    ...core.coreDemoHandlers,
    ...ai.aiDemoHandlers,
    ...integrations.integrationDemoHandlers,
    ...investments.investmentDemoHandlers,
    ...logs.logDemoHandlers,
    ...fallback.fallbackDemoHandlers
);
