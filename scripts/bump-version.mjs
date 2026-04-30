#!/usr/bin/env node
/**
 * Keep ha-addon/config.yaml, server/package.json, and Dockerfile (ARG BUILD_VERSION) in sync.
 *
 * Usage:
 *   node scripts/bump-version.mjs patch          # 1.0.4 -> 1.0.5 (default)
 *   node scripts/bump-version.mjs minor          # 1.0.5 -> 1.1.0
 *   node scripts/bump-version.mjs major          # 1.1.0 -> 2.0.0
 *   node scripts/bump-version.mjs 2.3.4          # explicit
 *
 * Notes:
 * - The single source of truth is `server/package.json`.
 * - `ha-addon/config.yaml` line `version: "x.y.z"` and Dockerfile `ARG BUILD_VERSION=x.y.z` are mirrored.
 * - Exits non-zero if any file is missing or unparseable.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const PKG = path.join(ROOT, 'server', 'package.json');
const CFG = path.join(ROOT, 'ha-addon', 'config.yaml');
const DOCKERFILE = path.join(ROOT, 'Dockerfile');

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

function parseSemver(v) {
    const m = SEMVER_RE.exec(String(v).trim());
    if (!m) throw new Error(`Not a semver: "${v}"`);
    return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function bump(current, kind) {
    if (SEMVER_RE.test(kind)) return kind;
    const [maj, min, pat] = parseSemver(current);
    if (kind === 'major') return `${maj + 1}.0.0`;
    if (kind === 'minor') return `${maj}.${min + 1}.0`;
    if (kind === 'patch' || !kind) return `${maj}.${min}.${pat + 1}`;
    throw new Error(`Unknown bump kind: ${kind} (use patch|minor|major|x.y.z)`);
}

function readJson(p) {
    return JSON.parse(readFileSync(p, 'utf8'));
}

function writeJson(p, obj) {
    writeFileSync(p, JSON.stringify(obj, null, 4) + '\n', 'utf8');
}

function replaceConfigYaml(next) {
    const raw = readFileSync(CFG, 'utf8');
    if (!/^version:\s*".+"\s*$/m.test(raw)) {
        throw new Error('ha-addon/config.yaml: could not find a `version: "x.y.z"` line');
    }
    const out = raw.replace(/^version:\s*".+"\s*$/m, `version: "${next}"`);
    writeFileSync(CFG, out, 'utf8');
}

function replaceDockerfile(next) {
    const raw = readFileSync(DOCKERFILE, 'utf8');
    if (!/^ARG BUILD_VERSION=.+$/m.test(raw)) {
        // Not fatal — Dockerfile may not pin a default; CI passes BUILD_VERSION explicitly.
        return false;
    }
    const out = raw.replace(/^ARG BUILD_VERSION=.+$/m, `ARG BUILD_VERSION=${next}`);
    writeFileSync(DOCKERFILE, out, 'utf8');
    return true;
}

function main() {
    const arg = process.argv[2] || 'patch';
    const pkg = readJson(PKG);
    const current = pkg.version;
    const next = bump(current, arg);

    pkg.version = next;
    writeJson(PKG, pkg);
    replaceConfigYaml(next);
    const dockerfileTouched = replaceDockerfile(next);

    console.log(`Bumped ${current} -> ${next}`);
    console.log(`  server/package.json   ✓`);
    console.log(`  ha-addon/config.yaml   ✓`);
    console.log(`  Dockerfile            ${dockerfileTouched ? '✓' : '(no ARG BUILD_VERSION default; skipped)'}`);
    console.log('');
    console.log('Next steps:');
    console.log(`  git add -A && git commit -m "chore(release): ${next}" && git push`);
    console.log(`  # or, to also publish a tag:`);
    console.log(`  git tag v${next} && git push --tags`);
}

main();
