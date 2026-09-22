import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { tailFile } from './tailFile.js';

test('tailFile reads only the requested complete lines from a large log', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ifo-tail-'));
  const file = path.join(dir, 'server.log');
  await fs.writeFile(file, Array.from({ length: 10_000 }, (_, i) => `line ${i}`).join('\n'));
  const result = await tailFile(file, 3, 128);
  assert.deepEqual(result.lines, ['line 9997', 'line 9998', 'line 9999']);
  assert.equal(result.truncated, true);
  await fs.rm(dir, { recursive: true, force: true });
});
