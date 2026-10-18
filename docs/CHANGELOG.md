# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Monorepo skeleton: npm workspaces, Vite (web and desktop modes), Vitest, ESLint flat config, Playwright.
- `packages/core/schema`: JSON Schemas and JSDoc typedefs of every entity, schema version 1, migration runner.
- `packages/core` public API with the contract signatures; unimplemented functions throw `NotImplementedError`.
- `packages/core/legislation/sk.json` skeleton with validity dates and sources, all values unverified.
- `packages/core/peppol/providers.json` with the first-wave providers and a generic SAPI-SK entry.
- App shell: sidebar and phone bottom bar with FAB, language (6) and theme switching, placeholder views for every route.
- i18n engine with Slovak and English bundled and Czech, German, Russian, Ukrainian loaded on demand; print dictionaries for SK, CS, EN, DE.
- Design tokens of the WE line with the WE Invoice cyan-blue accent and document status colours.
- Transport bridge interface with web and desktop implementations.
- Electron main process with the `app://` scheme and a minimal preload.
- Gateway skeleton (Fastify 5) with `/v1/health` and the full `openapi.yaml` contract.
- CI: lint, unit tests, gateway tests, web build, bundle size and legislation checks; workflow skeletons for e2e, UBL validation, Pages, release and the gateway image.
- Repository hygiene, dictionary completeness and hardcoded-text tests.

### Notes
- Data model additions beyond the specification: document kind `SALES_RECEIPT` (predajka) and payment method `QR_ON_SITE` (QR payment at the point of sale, relevant for eKasa).
