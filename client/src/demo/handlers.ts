import { coreDemoHandlers } from './handlers/core';
import { aiDemoHandlers } from './handlers/ai';
import { integrationDemoHandlers } from './handlers/integrations';
import { investmentDemoHandlers } from './handlers/investments';
import { logDemoHandlers } from './handlers/logs';
import { fallbackDemoHandlers } from './handlers/fallback';

// Keep the catch-all handlers last so domain handlers always get first refusal.
export const demoHandlers = [
    ...coreDemoHandlers,
    ...aiDemoHandlers,
    ...integrationDemoHandlers,
    ...investmentDemoHandlers,
    ...logDemoHandlers,
    ...fallbackDemoHandlers,
];
