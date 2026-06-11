# Locales structure

Translations are split by language and top-level namespace for easier maintenance.

## Layout

- `en/` - English translations, one file per namespace
- `he/` - Hebrew translations, one file per namespace
- `scrape-en.json` and `scrape-he.json` - scrape-specific translations merged on top

Each file in `en/` and `he/` should contain a single top-level key that matches the filename.

Example:

- `en/common.json` -> `{ "common": { ... } }`
- `he/common.json` -> `{ "common": { ... } }`

## Rules

- Keep namespace names identical across `en/` and `he/`.
- Add new keys to both languages in the same namespace.
- Do not reintroduce monolithic `en.json` / `he.json`.
- Keep `scrape-*.json` keys unique so they do not unintentionally override base keys.

## Runtime loading

`client/src/i18n.ts` loads all `en/*.json` and `he/*.json` files with `import.meta.glob(...)`,
merges them into language resources, then merges `scrape-en.json` / `scrape-he.json`.
