import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ApiError, apiNotFoundHandler, errorHandler } from './errorHandler.js';

let server: Server;
let base: string;

before(async () => {
    const app = express();
    app.use(express.json());
    app.get('/api/ok', (_req, res) => res.json({ success: true }));
    app.get('/api/boom', () => {
        throw new Error('sensitive internals: /home/user/secret-path');
    });
    app.get('/api/api-error', () => {
        throw new ApiError(422, 'profile name is taken', 'profile_name_taken');
    });
    app.post('/api/echo', (req, res) => res.json({ body: req.body }));
    app.use('/api', apiNotFoundHandler);
    app.use(errorHandler);
    await new Promise<void>((resolve) => {
        server = app.listen(0, '127.0.0.1', () => resolve());
    });
    const { port } = server.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
});

after(() => server.close());

test('unmatched /api route answers JSON 404, not Express HTML', async () => {
    const res = await fetch(`${base}/api/no-such-route`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'not_found');
});

test('thrown 5xx hides internals from the response', async () => {
    const res = await fetch(`${base}/api/boom`);
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'internal_error');
    assert.equal(body.error.message, 'Internal server error');
    assert.ok(!JSON.stringify(body).includes('secret-path'));
});

test('ApiError keeps its status, code and message', async () => {
    const res = await fetch(`${base}/api/api-error`);
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.error.code, 'profile_name_taken');
    assert.equal(body.error.message, 'profile name is taken');
});

test('malformed JSON body answers 400 JSON instead of an HTML stack trace', async () => {
    const res = await fetch(`${base}/api/echo`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json'
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(body.error.message.length > 0);
});
