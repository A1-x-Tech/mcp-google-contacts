# Development

## Requirements

- Node.js 20+ (the published package ships compiled `dist/`; `npx` needs no separate
  install). CI runs the suite on Node 20, 22 and 24.

## Commands

```bash
npm install
npm run dev        # run from source with tsx watch
npm test           # unit tests (node:test) + dist smoke, no network
npm run typecheck  # type-check src + tests (no emit)
npm run build      # clean dist/ and compile with tsc
npm run smoke      # live READ-ONLY check (see below)
npm run smoke -- --live   # opt-in live WRITE scenario on disposable resources
```

## Local run

```bash
npm run build
GOOGLE_CONTACTS_CLIENT_ID=... GOOGLE_CONTACTS_CLIENT_SECRET=... GOOGLE_CONTACTS_REFRESH_TOKEN=... \
  node dist/index.js
# or, for a quick session with a short-lived token:
GOOGLE_CONTACTS_ACCESS_TOKEN=$(gcloud auth print-access-token) node dist/index.js
# optional: GOOGLE_CONTACTS_API_BASE, GOOGLE_CONTACTS_TIMEOUT_MS, GOOGLE_CONTACTS_MAX_RETRIES
```

## OAuth scopes

Mint the refresh token with the **minimum** scopes for what you use:

- `https://www.googleapis.com/auth/contacts` — read/write contacts and contact groups
  (needed by every mutating tool; also covers all reads).
- `https://www.googleapis.com/auth/contacts.readonly` — enough if only the read-only
  tools will be used.
- `https://www.googleapis.com/auth/contacts.other.readonly` — additionally required by
  `list_other_contacts`; `copy_other_contact` needs it **and** `contacts`.

A 403 `PERMISSION_DENIED` on a single tool usually means the refresh token was minted
without the scope that tool needs — re-consent with the missing scope added.

## Live smoke checks

`npm run smoke` makes one live read: with a resource name (first argv or
`GOOGLE_CONTACTS_SMOKE_RESOURCE`, e.g. `people/me`) it fetches that person; without one
it just mints an access token from the refresh token — either way nothing is written.

`npm run smoke -- --live` is the **opt-in** write scenario on disposable resources only:
it creates a uniquely named contact and contact group, links them, updates the contact
(exercising the auto-etag path), verifies the round-trip and then deletes both. Cleanup
runs in `finally` — after success **and** after an error — so nothing outlives the run;
pre-existing contacts and groups are never touched. Run it against a throwaway Google
account when possible.

## Tests

Unit tests mock `globalThis.fetch` (client) or use a fake server + fake client (tools), so
the whole suite runs offline — including the OAuth refresh flow, whose token endpoint is
served by the same fetch stub. `test/dist-smoke.test.js` additionally spawns the built
`dist/index.js` and performs a real MCP handshake over stdio through the official SDK,
asserting the server identity and the full tool list — both configured and with no
credentials at all (the degraded-start contract). Put a `*.test.ts` next to the code it
covers; `npm run typecheck && npm test` is the gate (also run by `prepublishOnly`).

## Usage telemetry

The server sends anonymous events to `usage.gistrec.cloud` (`server_start` when a client
connects to a configured install, `unconfigured_start` when a client connects to a server
without credentials, `tool_call` with the tool **name**, and `startup_failed` with a
fixed-vocabulary reason code when the configuration is malformed) to count active installs
and tool demand. An event carries only impersonal technical fields: a random installation
id (`~/.config/mcp-google-contacts/instance-id`), the package version, the AI client's
name and version from the MCP handshake, the Node.js version and the OS.

OAuth credentials, contact data, tool arguments and prompts are never sent or stored
(implementation: `src/telemetry.ts`). Sends run in the background with a 2 s timeout and
are silently skipped on any error. Opt out for all servers of this line at once:
`ASKADS_TELEMETRY=0`.
