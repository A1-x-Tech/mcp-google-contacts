# CLAUDE.md — mcp-google-contacts

MCP server for the Google People API v1 — the API behind Google Contacts —
(TypeScript, stdio). Mixed read/write: tools cover contact list/search/read,
contact CRUD, contact groups and membership, batch mutations and read-only
"Other contacts"; `raw_request` is the escape hatch. The server talks to
`https://people.googleapis.com` with a Bearer token; the token is minted from an
OAuth2 refresh token via `https://oauth2.googleapis.com/token` (or a static
`GOOGLE_CONTACTS_ACCESS_TOKEN`, mostly for testing).

## Commands

```bash
npm run dev        # run from source (tsx watch)
npm test           # unit tests + dist smoke, no network
npm run typecheck  # types for src + tests
npm run build      # emit dist/
npm run smoke      # live READ-ONLY check (refresh-flow creds; optional resource argv/GOOGLE_CONTACTS_SMOKE_RESOURCE)
npm run smoke -- --live  # opt-in live WRITE scenario on disposable resources, cleanup in finally
```

## Architecture

- `src/config.ts` — env → config. Credentials: either the refresh triple
  `GOOGLE_CONTACTS_CLIENT_ID` + `GOOGLE_CONTACTS_CLIENT_SECRET` + `GOOGLE_CONTACTS_REFRESH_TOKEN`
  (all three or `ConfigError` `incomplete_oauth_config`) or `GOOGLE_CONTACTS_ACCESS_TOKEN`;
  optional `GOOGLE_CONTACTS_API_BASE`, `GOOGLE_CONTACTS_TIMEOUT_MS`, `GOOGLE_CONTACTS_MAX_RETRIES`.
  No credentials at all is NOT an error: the fields stay `undefined` and the server starts
  degraded. Also home to `CredentialsError` / `MISSING_CREDENTIALS_MESSAGE` (opens with the
  historical startup error verbatim, then names the variables and the restart) and
  `hasCredentials()`.
- `src/client.ts` — all HTTP and all wire mapping. Token lifecycle (cache until ~60s before
  expiry, dedupe concurrent refreshes, one forced re-mint + replay on 401); `request()`
  resolves the path against the base and rejects foreign origins (SSRF guard), enforces an
  AbortController timeout that also covers reading the body, retries 429 always but 5xx/network
  errors **only for GET** — replaying a write after an ambiguous failure would apply it twice —
  and throws `GoogleContactsError(status, body)`. Array query values become repeated params
  (`resourceNames=a&resourceNames=b` for `people:batchGet`). `buildPerson()` maps the normalized
  contact vocabulary (given_name/emails/phones/... in `ContactFields`) to the wire Person and
  returns the touched field groups — that list IS the computed `updatePersonFields` mask.
  Etag handling lives here too: `updateContact` / `updateContactGroup` /
  `batchUpdateContacts` fetch the current etag when the caller has none (one extra read;
  batch uses a single `batchGet`). `searchContacts` / `searchOtherContacts` send the
  documented warmup request (empty query) once per endpoint per session — never retried,
  failures swallowed — before the first real query, not before every search.
- `src/tools/contacts.ts` — `list_contacts`, `search_contacts`, `get_contact`,
  `batch_get_contacts`, `create_contact`, `update_contact`, `delete_contact`.
  `src/tools/groups.ts` — `list_contact_groups`, `get_contact_group`, `create_contact_group`,
  `update_contact_group`, `delete_contact_group`, `modify_group_members`.
  `src/tools/batch.ts` — `batch_create_contacts`, `batch_update_contacts`,
  `batch_delete_contacts`. `src/tools/other.ts` — `list_other_contacts` (list or, with
  `query`, search), `copy_other_contact`. `src/tools/raw.ts` — `raw_request`
  (GET/POST/PATCH/PUT/DELETE). `src/tools/util.ts` — `ok`/`fail`, the four annotation presets
  (`READ_ONLY`/`WRITE`/`UPDATE`/`DESTRUCTIVE`), shared zod schema factories
  (`personResourceNameSchema`, `personFieldsSchema`, ...), the `contactFieldsShape()` input
  factory and `toContactFields()` (snake_case → normalized, no wire knowledge).
- `src/index.ts` — wires every `register*` into the McpServer. `loadConfigOrDegraded()`
  catches `ConfigError`, pings `startup_failed` (fire-and-forget) and degrades the config to
  "no credentials"; an unconfigured start prepends `UNCONFIGURED_PREFIX` — plus
  `Configuration problem: <message>` when a ConfigError was caught — to the initialize
  `instructions`, and `oninitialized` sends `server_start` for a configured install or
  `unconfigured_start` (with the reason) otherwise.
- `src/telemetry.ts` — anonymous usage pings (ids/names/versions only, never data or
  arguments; fire-and-forget, must never block or throw; opt-out `ASKADS_TELEMETRY=0`).
  `server_start` means "a usable install started"; `unconfigured_start` is a degraded start
  and `startup_failed` a malformed config caught at load — both carry a `reason` from a
  closed vocabulary (`missing_credentials`, `incomplete_oauth_config`) — never a variable's
  name or value.

## Conventions (do not break)

- **Never exit because of configuration.** A server that dies before the MCP handshake leaves
  the user with a red cross and no reason — telemetry across this line of servers showed that
  state accounted for nearly every unconfigured install, and almost none of them recovered.
  Missing credentials are a survivable state: start, answer initialize (with the unconfigured
  prefix in `instructions`) and tools/list, and let the first tool call fail with
  `CredentialsError` — its message names the variables to set and says to restart, because
  credentials come only from the environment. `config.test.ts`, `client.test.ts` and
  `test/dist-smoke.test.js` pin this.
- **Credential failures are not transport failures.** `CredentialsError` is thrown in
  `accessToken()` before any fetch — before the retry/backoff loop, the token mint and the
  401 replay — because retrying it burns seconds of backoff before the user sees the one
  message that helps. Pinned by the "fetch never called" assertion in `client.test.ts`.
- **Never retry a write on 5xx/network errors.** Only 429 (rejected before executing) and GET
  are safe; the gate lives in `request()` and is pinned by tests. This includes DELETE and
  PATCH — replaying a batch mutation after an ambiguous failure could apply it twice.
- **Wire mapping lives in the client, not the tools.** Tools accept the normalized snake_case
  vocabulary and must not know the wire shapes (`honorificPrefix`, `streetAddress`,
  `updatePersonFields` masks, `contactPerson` wrappers) — add any mapping in `client.ts`.
  `toContactFields()` in util.ts only renames keys.
- **Auth is the client's job.** Tools never see tokens; the Bearer header, refresh, caching
  and the 401 replay all live in `request()`/`accessToken()`.
- **Field masks are explicit and compact by default.** Reads return ONLY masked fields; the
  default is `names,emailAddresses,phoneNumbers,organizations,memberships` — tool
  descriptions must keep telling the model that an absent field may be unmasked, not empty.
- **Etags guard every update.** `update_contact`/`update_contact_group`/
  `batch_update_contacts` require the current etag and fetch it when omitted; never strip
  that or writes will clobber concurrent edits silently.
- **Resource names are full** (`people/c...`, `contactGroups/...`, `otherContacts/...`) —
  validated by the schema factories and re-validated in the client before any fetch; error
  messages never echo the input back (it may contain user data).
- **No secrets or contact data in logs/errors.** `GoogleContactsError` carries only what the
  API said; telemetry carries only names/ids/versions.
- **Validate inputs with zod** in `inputSchema`; reuse the shared schema **factories** in
  `util.ts` (a fresh schema per field avoids `$ref` dedup in the JSON schema).
- **Annotations are pinned per tool** in `annotations.test.ts` — changing one is a conscious
  decision that updates the map, with all four hints always set.
- **Output compact JSON via `ok`** — the consumer is an LLM; pretty-printing burns tokens.
  Responses pass through verbatim (describe the fields in the tool `description`, the only
  place the external model reads).

## Adding a tool

Before changing the tool registry, read [the MCP capability documentation contract](docs/CAPABILITY-DOCUMENTATION.md). Every registered tool must have exactly one task-oriented page in `docs/capabilities/`; update that page, the index, and the coverage test in the same change.

1. Add (or extend) `src/tools/<name>.ts` with `register<Name>Tools(server, client)`.
2. If it hits a new endpoint, add a method to `src/client.ts` with the wire mapping.
3. Import and call the register fn in `src/index.ts`.
4. Add a `*.test.ts` using the mock-fetch (client) / fake-client (tools) harness — no
   network — and add the tool + hints to `annotations.test.ts` and `test/dist-smoke.test.js`.
5. `npm run typecheck && npm test`.

## Releasing

Keep the version in sync across **all** channels in one go (`git push --follow-tags` pushes
the tag but does **not** create a GitHub Release; the registry is immutable per version):

1. Bump `version` in **three places, identically**: `package.json`, and in `server.json`
   **both** the root `version` **and** `packages[0].version`. `mcpName` in `package.json` must
   match `name` in `server.json` (`io.github.A1-x-Tech/mcp-google-contacts`). Verify:
   `grep -n '"version"' package.json server.json`.
   > ⚠️ `mcp-publisher` publishes the **root** `server.json.version`. A stale root makes
   > `mcp-publisher publish` fail with a misleading `400 cannot publish duplicate version`
   > while `npm publish` succeeds.
2. Update `CHANGELOG.md`, then `npm publish` (runs typecheck + tests + build via
   `prepublishOnly` / `prepare`).
3. `git commit`, `git tag -a vX.Y.Z -m vX.Y.Z`, `git push origin main --follow-tags`.
4. **GitHub Release:** `gh release create vX.Y.Z --title vX.Y.Z --generate-notes --verify-tag`.
5. **Official MCP registry:** `mcp-publisher publish` (login with
   `mcp-publisher login github --token "$(gh auth token)"`).
