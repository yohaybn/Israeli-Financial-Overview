import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCorsOriginChecker } from './corsOrigin.js';

test('allows requests without an Origin header (same-origin, curl, Electron)', () => {
    const check = createCorsOriginChecker('');
    assert.equal(check(undefined), true);
    assert.equal(check(''), true);
    assert.equal(check('null'), true);
});

test('allows loopback origins on any port', () => {
    const check = createCorsOriginChecker('');
    assert.equal(check('http://localhost:5173'), true);
    assert.equal(check('http://127.0.0.1:3000'), true);
    assert.equal(check('http://[::1]:8080'), true);
});

test('allows private/LAN origins typical for a home server', () => {
    const check = createCorsOriginChecker('');
    assert.equal(check('http://192.168.1.10:3000'), true);
    assert.equal(check('http://10.0.0.5'), true);
    assert.equal(check('http://172.16.3.9:9203'), true);
    assert.equal(check('http://172.31.255.255'), true);
    assert.equal(check('http://home-server.local:3000'), true);
    assert.equal(check('https://ha.home.arpa'), true);
});

test('rejects public origins not explicitly allowed', () => {
    const check = createCorsOriginChecker('');
    assert.equal(check('https://evil.example.com'), false);
    assert.equal(check('http://8.8.8.8:3000'), false);
    assert.equal(check('http://172.32.0.1'), false); // outside 172.16/12
    assert.equal(check('https://localhost.evil.com'), false);
    assert.equal(check('not-a-url'), false);
    assert.equal(check('ftp://localhost'), false);
});

test('allows exact origins from CORS_EXTRA_ORIGINS', () => {
    const check = createCorsOriginChecker('https://ha.example.com, https://dashboard.example.org');
    assert.equal(check('https://ha.example.com'), true);
    assert.equal(check('https://dashboard.example.org'), true);
    assert.equal(check('https://other.example.com'), false);
    // exact match, not a suffix match
    assert.equal(check('https://ha.example.com.evil.com'), false);
});
