import test from 'node:test';
import assert from 'node:assert/strict';
import { backupScopesInSnapshot } from './backupScopes.js';

test('backupScopesInSnapshot collects unique scopes from paths', () => {
    const scopes = backupScopesInSnapshot({
        files: [
            { path: 'app.db' },
            { path: 'results/x.json' },
            { path: 'config/a.json' },
            { path: 'unknown/thing' }
        ]
    });
    assert.deepEqual(scopes, ['database', 'results', 'config']);
});
