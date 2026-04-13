const TELEGRAM_FILE_HOST = 'api.telegram.org';

/**
 * Telegram Bot API file_path values are relative paths (e.g. photos/file_0.jpg).
 * Reject anything that could alter URL semantics or enable SSRF via redirects/path tricks.
 */
export function isSafeTelegramRelativeFilePath(filePath: string): boolean {
  if (!filePath || filePath.includes('..')) return false;
  return /^[a-zA-Z0-9/_.\-]+$/.test(filePath);
}

/**
 * Ensures a URL is exactly a Telegram bot file download on api.telegram.org over HTTPS,
 * with a path scoped to this bot token. Call before server-side fetch to mitigate SSRF.
 */
export function assertSafeTelegramBotFileUrl(urlString: string, botToken: string): void {
  if (!urlString?.trim() || !botToken) {
    throw new Error('Invalid Telegram file URL');
  }
  let u: URL;
  try {
    u = new URL(urlString);
  } catch {
    throw new Error('Invalid Telegram file URL');
  }
  if (u.protocol !== 'https:') throw new Error('Invalid Telegram file URL');
  if (u.username !== '' || u.password !== '') throw new Error('Invalid Telegram file URL');
  if (u.hostname.toLowerCase() !== TELEGRAM_FILE_HOST) throw new Error('Invalid Telegram file URL');
  if (u.port !== '' && u.port !== '443') throw new Error('Invalid Telegram file URL');
  const prefix = `/file/bot${botToken}/`;
  if (!u.pathname.startsWith(prefix)) throw new Error('Invalid Telegram file URL');
  const rest = u.pathname.slice(prefix.length);
  if (!isSafeTelegramRelativeFilePath(rest)) throw new Error('Invalid Telegram file URL');
}
