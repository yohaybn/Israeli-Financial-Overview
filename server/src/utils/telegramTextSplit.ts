/**
 * Split long text for Telegram sendMessage/editMessageText (4096 char limit).
 * Plain-text: newline/sentence/whitespace preferences; MarkdownV2-safe backslash boundaries;
 * UTF-16 surrogate-safe boundaries.
 * HTML: only split outside tags and outside &...; entities.
 */

const TELEGRAM_MAX_MESSAGE_CHARS = 4096;

export function getTelegramMaxMessageChars(): number {
  return TELEGRAM_MAX_MESSAGE_CHARS;
}

/**
 * Split plain or MarkdownV2 text into Telegram-safe chunks.
 */
export function splitTelegramPlainText(message: string, maxLen: number): string[] {
  const text = String(message || '');
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    let splitAt = findBestSplitPoint(remaining, maxLen);
    if (splitAt <= 0 || splitAt > remaining.length) {
      splitAt = Math.min(maxLen, remaining.length);
    }
    splitAt = adjustSplitForSafeBoundary(remaining, splitAt);

    const chunk = remaining.slice(0, splitAt).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

/**
 * Ensure we don't split in the middle of a MarkdownV2 escape (backslash + char)
 * or in the middle of a UTF-16 surrogate pair (emoji).
 */
function adjustSplitForSafeBoundary(text: string, splitAt: number): number {
  if (splitAt <= 0 || splitAt >= text.length) return splitAt;
  let pos = splitAt;
  while (pos > 0 && text[pos - 1] === '\\') {
    pos--;
  }
  const atPos = text.charCodeAt(pos);
  if (pos < text.length && atPos >= 0xdc00 && atPos <= 0xdfff && pos > 0) {
    pos--;
  }
  return Math.max(1, pos);
}

function findBestSplitPoint(text: string, maxLen: number): number {
  const safeMax = Math.min(maxLen, text.length);
  const candidate = text.slice(0, safeMax + 1);

  const newline = candidate.lastIndexOf('\n');
  if (newline >= Math.floor(safeMax * 0.6)) {
    return newline + 1;
  }

  for (let i = safeMax; i >= Math.floor(safeMax * 0.6); i--) {
    const c = candidate[i];
    if (!c) continue;
    if (c === '.' || c === '!' || c === '?' || c === '…' || c === ';') {
      return i + 1;
    }
  }

  const ws = Math.max(candidate.lastIndexOf(' '), candidate.lastIndexOf('\t'));
  if (ws >= Math.floor(safeMax * 0.6)) {
    return ws + 1;
  }

  return safeMax;
}

function isPreOpenTag(tag: string): boolean {
  return /^<pre(\s[^>]*)?>$/i.test(tag);
}

function isPreCloseTag(tag: string): boolean {
  return /^<\/pre\s*>$/i.test(tag);
}

/**
 * After consuming [0, splitAt), we must not be inside <...> or &...;,
 * and must not be inside <pre>...</pre> body (Telegram requires well-formed fragments).
 */
function isSafeHtmlSplitEnd(html: string, splitAt: number): boolean {
  let i = 0;
  let inTag = false;
  let inEntity = false;
  let preDepth = 0;

  while (i < splitAt) {
    const c = html[i];
    if (inTag) {
      if (c === '>') inTag = false;
      i++;
      continue;
    }
    if (inEntity) {
      if (c === ';') inEntity = false;
      i++;
      continue;
    }
    if (c === '<') {
      const closeGt = html.indexOf('>', i);
      if (closeGt === -1 || closeGt >= splitAt) {
        inTag = true;
        i++;
        continue;
      }
      const tagSlice = html.slice(i, closeGt + 1);
      if (isPreOpenTag(tagSlice)) {
        preDepth++;
        i = closeGt + 1;
        continue;
      }
      if (isPreCloseTag(tagSlice)) {
        preDepth = Math.max(0, preDepth - 1);
        i = closeGt + 1;
        continue;
      }
      inTag = true;
      i++;
      continue;
    }
    if (c === '&') inEntity = true;
    i++;
  }
  return !inTag && !inEntity && preDepth === 0;
}

function adjustSplitForSurrogateOnly(text: string, splitAt: number): number {
  if (splitAt <= 0 || splitAt >= text.length) return splitAt;
  let pos = splitAt;
  const atPos = text.charCodeAt(pos);
  if (pos < text.length && atPos >= 0xdc00 && atPos <= 0xdfff && pos > 0) {
    pos--;
  }
  return Math.max(1, pos);
}

function findBestHtmlSplitPoint(html: string, maxLen: number): number {
  const safeMax = Math.min(maxLen, html.length);
  const minPos = Math.max(1, Math.floor(safeMax * 0.5));

  for (let i = safeMax; i >= minPos; i--) {
    if (!isSafeHtmlSplitEnd(html, i)) continue;
    if (i > 0 && html[i - 1] === '\n') return i;
  }
  for (let i = safeMax; i >= minPos; i--) {
    if (!isSafeHtmlSplitEnd(html, i)) continue;
    if (i > 0 && (html[i - 1] === ' ' || html[i - 1] === '\t')) return i;
  }
  for (let i = safeMax; i >= 1; i--) {
    if (isSafeHtmlSplitEnd(html, i)) return i;
  }
  return safeMax;
}

/**
 * Split Telegram HTML (parse_mode HTML) without breaking tags or named/char entities.
 */
export function splitTelegramHtmlChunks(html: string, maxLen: number): string[] {
  const text = String(html || '');
  const cap = Math.min(maxLen, TELEGRAM_MAX_MESSAGE_CHARS);
  if (text.length <= cap) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > cap) {
    let splitAt = findBestHtmlSplitPoint(remaining, cap);
    if (splitAt <= 0 || splitAt > remaining.length) {
      splitAt = Math.min(cap, remaining.length);
    }
    splitAt = adjustSplitForSurrogateOnly(remaining, splitAt);
    if (!isSafeHtmlSplitEnd(remaining, splitAt)) {
      let found = false;
      for (let j = splitAt; j >= 1; j--) {
        if (isSafeHtmlSplitEnd(remaining, j)) {
          splitAt = j;
          found = true;
          break;
        }
      }
      if (!found) {
        splitAt = Math.min(cap, remaining.length);
        splitAt = adjustSplitForSurrogateOnly(remaining, splitAt);
      }
    }

    let chunk = remaining.slice(0, splitAt).trim();
    if (chunk.length === 0 && remaining.length > 0) {
      splitAt = Math.max(1, Math.min(cap, remaining.length));
      chunk = remaining.slice(0, splitAt);
    }
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}
