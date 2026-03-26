/**
 * Embeds Telegram bot guides into client/public/GUIDE.html (EN + HE).
 *
 * Run from repo root (after generating both HTML fragments):
 *   npx marked -o .tmp-telegram.html -i docs/TELEGRAM_BOT_GUIDE.md --gfm
 *   npx marked -o .tmp-telegram-he.html -i client/public/guides/TELEGRAM_BOT_GUIDE.he.md --gfm
 *   node scripts/inline-telegram-guide-into-guide.mjs
 *
 * English source: docs/TELEGRAM_BOT_GUIDE.md
 * Hebrew source:  client/public/guides/TELEGRAM_BOT_GUIDE.he.md (tracked in git)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const tmpEn = path.join(root, '.tmp-telegram.html');
const tmpHe = path.join(root, '.tmp-telegram-he.html');

if (!fs.existsSync(tmpEn)) {
  console.error('Missing .tmp-telegram.html — run: npx marked -o .tmp-telegram.html -i docs/TELEGRAM_BOT_GUIDE.md --gfm');
  process.exit(1);
}
if (!fs.existsSync(tmpHe)) {
  console.error(
    'Missing .tmp-telegram-he.html — run: npx marked -o .tmp-telegram-he.html -i client/public/guides/TELEGRAM_BOT_GUIDE.he.md --gfm'
  );
  process.exit(1);
}

function prepareInner(raw) {
  let inner = raw;
  inner = inner.replace(/^<h1>[\s\S]*?<\/h1>\s*/, '');
  inner = inner.replace(/<pre>/g, '<pre class="code-block">');
  return inner;
}

const introEn =
  '<p class="callout info">Source: <code>docs/TELEGRAM_BOT_GUIDE.md</code> in the repository.</p>\n';
const introHe =
  '<p class="callout info">מקור: <code>client/public/guides/TELEGRAM_BOT_GUIDE.he.md</code></p>\n';

const bodyEn = introEn + '<div class="telegram-guide-body">' + prepareInner(fs.readFileSync(tmpEn, 'utf8')) + '</div>';
const bodyHe = introHe + '<div class="telegram-guide-body">' + prepareInner(fs.readFileSync(tmpHe, 'utf8')) + '</div>';

function escapeTemplateLiteral(s) {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

function replaceBlock(guide, startNeedle, newInnerEscaped) {
  const start = guide.indexOf(startNeedle);
  if (start === -1) throw new Error('startNeedle not found: ' + startNeedle.slice(0, 80));
  const contentStart = start + startNeedle.length;
  const endMarker = '\n                        `\n                    },';
  const end = guide.indexOf(endMarker, contentStart);
  if (end === -1) throw new Error('end marker not found after position ' + contentStart);
  return guide.slice(0, contentStart) + newInnerEscaped + guide.slice(end);
}

const guidePath = path.join(root, 'client', 'public', 'GUIDE.html');
let guide = fs.readFileSync(guidePath, 'utf8');

const enNeedle =
  '                    "telegram-guide": {\n                        title: "✈️ Telegram bot",\n                        html: `';
const heNeedle =
  '                    "telegram-guide": {\n                        title: "✈️ בוט טלגרם",\n                        html: `';

guide = replaceBlock(guide, enNeedle, escapeTemplateLiteral(bodyEn));
guide = replaceBlock(guide, heNeedle, escapeTemplateLiteral(bodyHe));

fs.writeFileSync(guidePath, guide, 'utf8');
console.log('Updated', guidePath);
