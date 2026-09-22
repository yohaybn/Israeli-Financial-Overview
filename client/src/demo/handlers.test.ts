import { describe, expect, it } from 'vitest';
import { demoHandlers } from './handlers';
import { coreDemoHandlers } from './handlers/core';
import { aiDemoHandlers } from './handlers/ai';
import { integrationDemoHandlers } from './handlers/integrations';
import { investmentDemoHandlers } from './handlers/investments';
import { logDemoHandlers } from './handlers/logs';
import { fallbackDemoHandlers } from './handlers/fallback';

const domains = [
    coreDemoHandlers,
    aiDemoHandlers,
    integrationDemoHandlers,
    investmentDemoHandlers,
    logDemoHandlers,
    fallbackDemoHandlers,
];

describe('demo handler registry', () => {
    it('keeps every domain handler in order and the catch-all last', () => {
        expect(demoHandlers).toEqual(domains.flat());
        expect(demoHandlers).toHaveLength(98);
        expect(demoHandlers[demoHandlers.length - 1]).toBe(fallbackDemoHandlers[0]);
    });

    it('keeps each domain independently populated', () => {
        expect(domains.map((handlers) => handlers.length)).toEqual([16, 21, 39, 11, 10, 1]);
    });
});
