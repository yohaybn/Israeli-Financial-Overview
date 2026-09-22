import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'fs-extra';
import path from 'node:path';

test('AI log pages use per-call JSON index instead of scanning the append log', async () => {
  const dir = await fs.mkdtemp(path.join(process.cwd(), '.tmp-ai-index-'));
  process.env.DATA_DIR = dir;
  const { getAILogs, getAILogById } = await import(`./aiLogger.js?test=${Date.now()}`);
  const calls = path.join(dir, 'logs', 'ai_calls');
  await fs.ensureDir(calls);
  const make = (id: string) => ({ id, timestamp: new Date().toISOString(), model: 'm', provider: 'gemini', requestInfo: { userInput: id, inputLength: 1 }, responseInfo: { success: true }, metadata: { latencyMs: 1 } });
  await fs.writeJson(path.join(calls, '100-a.json'), make('100-a'));
  await fs.writeJson(path.join(calls, '200-b.json'), make('200-b'));
  await fs.writeFile(path.join(dir, 'logs', 'ai_interactions.log'), '{broken and huge index');
  assert.deepEqual((await getAILogs({ limit: 1 })).logs.map((x: { id: string }) => x.id), ['200-b']);
  assert.equal((await getAILogById('100-a'))?.id, '100-a');
  await fs.remove(dir);
});
