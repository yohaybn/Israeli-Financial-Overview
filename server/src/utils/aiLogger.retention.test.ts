import assert from 'node:assert/strict';
import test from 'node:test';
import { partitionAILogLinesForRetention } from './aiLogger.js';

const entry = (id: string, timestamp: string) => JSON.stringify({
  id,
  timestamp,
  model: 'test',
  provider: 'gemini',
  requestInfo: { userInput: 'test', inputLength: 4 },
  responseInfo: { success: true },
  metadata: { latencyMs: 1 }
});

test('retention removes old index entries so they no longer remain visible', () => {
  const cutoff = Date.parse('2026-09-01T00:00:00.000Z');
  const oldLine = entry('old', '2026-08-01T00:00:00.000Z');
  const currentLine = entry('current', '2026-09-20T00:00:00.000Z');

  const result = partitionAILogLinesForRetention(`${oldLine}\n${currentLine}\n`, cutoff);

  assert.deepEqual(result.deletedLogs.map(log => log.id), ['old']);
  assert.deepEqual(result.retainedLines, [currentLine]);
});

test('retention preserves malformed and invalid-timestamp lines', () => {
  const malformed = '{not-json';
  const invalidTimestamp = entry('invalid', 'not-a-date');

  const result = partitionAILogLinesForRetention(
    `${malformed}\n${invalidTimestamp}\n`,
    Date.parse('2026-09-01T00:00:00.000Z')
  );

  assert.deepEqual(result.deletedLogs, []);
  assert.deepEqual(result.retainedLines, [malformed, invalidTimestamp]);
});
