import fs from 'node:fs/promises';

export interface TailResult {
  lines: string[];
  truncated: boolean;
}

/** Read only enough bytes from the end of a UTF-8 log to return complete lines. */
export async function tailFile(filePath: string, lineCount: number, chunkSize = 64 * 1024): Promise<TailResult> {
  const file = await fs.open(filePath, 'r');
  try {
    const { size } = await file.stat();
    let position = size;
    let text = '';
    while (position > 0) {
      const length = Math.min(chunkSize, position);
      position -= length;
      const buffer = Buffer.allocUnsafe(length);
      await file.read(buffer, 0, length, position);
      text = buffer.toString('utf8') + text;
      if (text.split('\n').filter(Boolean).length > lineCount) break;
    }
    const lines = text.split('\n').filter(line => line.trim() !== '');
    return { lines: lines.slice(-lineCount), truncated: position > 0 || lines.length > lineCount };
  } finally {
    await file.close();
  }
}
