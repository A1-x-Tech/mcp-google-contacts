# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and the project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- The search-cache warmup request (empty query) is now sent once per endpoint per
  session — before the first `search_contacts` / Other-contacts search — instead of
  before every search, halving the quota spend of repeated searches; a failed warmup
  is no longer retried, so its backoff can never delay the real query.
- `Retry-After` is now honored in both RFC 9110 forms — delay-seconds and HTTP-date —
  when backing off before a retry (the date form used to fall back silently to the
  exponential schedule).

### Fixed

- `birthday` can now be cleared through the normalized vocabulary: pass `""` to
  `update_contact` / `batch_update_contacts` (like `nickname`/`notes`); previously
  clearing it required `raw_request`.

## [0.1.0] — 2026-08-30

### Added

- First release: a full MCP server for the Google Contacts / People API v1 (stdio,
  TypeScript, `@modelcontextprotocol/sdk` + `zod`).
- Tools (19):
  - `list_contacts` — connections with explicit field masks, pagination, sorting and
    incremental-sync tokens;
  - `search_contacts` — prefix search with the documented warmup request sent automatically;
  - `get_contact`, `batch_get_contacts` — single and bulk (≤200) reads;
  - `create_contact`, `update_contact` (etag-guarded, computed `updatePersonFields`),
    `delete_contact`;
  - `list_contact_groups`, `get_contact_group` (with member resource names),
    `create_contact_group`, `update_contact_group` (etag-guarded rename),
    `delete_contact_group` (`delete_contacts` forwarded only when explicitly set),
    `modify_group_members`;
  - `batch_create_contacts` (≤200), `batch_update_contacts` (≤200, shared union update
    mask, missing etags fetched in one batchGet), `batch_delete_contacts` (≤500);
  - `list_other_contacts` (list or search of auto-saved addresses),
    `copy_other_contact`;
  - `raw_request` — escape hatch to any People API v1 path (SSRF-guarded;
    GET/POST/PATCH/PUT/DELETE).
- Degraded start: missing credentials never kill the process — the server completes the
  MCP handshake, carries the fix in the initialize instructions and fails the first tool
  call with an actionable `CredentialsError` before any fetch.
- OAuth2 refresh flow: access tokens minted from
  `GOOGLE_CONTACTS_CLIENT_ID`/`_CLIENT_SECRET`/`_REFRESH_TOKEN`, cached until just before
  expiry, deduped across concurrent requests and re-minted once on a 401; a static
  `GOOGLE_CONTACTS_ACCESS_TOKEN` works as an alternative.
- Resilience: request timeout covering body reads, `Retry-After`-aware backoff, 429
  retried for every method, 5xx/network retries gated to reads so writes are never
  replayed.
- Anonymous usage telemetry (event/tool names and versions only; opt out with
  `ASKADS_TELEMETRY=0`), including `unconfigured_start` and the `startup_failed`
  drop-off ping.
- Offline test suite: mocked-fetch client tests incl. the OAuth flow and etag pre-reads,
  fake-server tool tests, pinned per-tool annotations, capability-docs coverage tests,
  plus a dist smoke test that spawns the built binary and performs a real MCP handshake
  over stdio (configured and unconfigured).
- Opt-in live smoke scenario (`npm run smoke -- --live`) on disposable resources with
  cleanup after success and failure; read-only `npm run smoke` for daily health checks.
- CI (Node 20/22/24: typecheck + build + tests) and a daily read-only live health check
  that skips itself when repo secrets are absent.

[0.1.0]: https://github.com/A1-x-Tech/mcp-google-contacts/releases/tag/v0.1.0
