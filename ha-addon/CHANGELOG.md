# Changelog

All notable changes to this Home Assistant add-on are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- Add-on metadata lives under `ha-addon/` (`config.yaml`, store README, `CHANGELOG.md`, `logo.png`, `icon.png`). Install uses prebuilt GHCR images (`image:` in `config.yaml`). Sidebar uses `panel_icon: mdi:finance`.

## [1.3.3] - 2026-04-30

### Changed

- Financial report features and related UI/application enhancements.

## [1.0.5] - 2026-04-30

### Fixed

- Home Assistant Ingress: API and WebSocket routing through the proxy.

### Changed

- CI auto-bump of version aligned with `config.yaml` and server package.

## [1.0.4] - 2026-04-30

### Changed

- Ingress-oriented fixes and versioning aligned with prior pipeline.

## [1.0.2] - 2026-04-26

### Changed

- Default internal HTTP port **9203** for Ingress (`ingress_port` / `PORT` in image).

### Fixed

- Home Assistant s6/init compatibility (`init: false`).
- Optional Google/Drive options schema and environment parity with standalone Docker.

## Earlier Home Assistant work

### Fixed

- Conditional Alpine (`apk`) vs Debian (`apt-get`) in add-on image when `BUILD_FROM` is the app Debian base.
- Node and native build dependencies on HA Alpine base images.
- Multi-arch Home Assistant base images (`aarch64`, `amd64`, `armv7` / `armhf`).
- Supervisor build context: add-on definition co-located with full monorepo for image builds (superseded by image-only install from GHCR for end users).
