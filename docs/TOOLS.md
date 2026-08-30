# Tools

For task-oriented guidance, open the [MCP capability catalog](./capabilities/index.md). This page remains the technical reference for schemas and API responses.

The Google People API mixes reads and writes, so every tool carries explicit MCP
annotations: reads are `readOnlyHint`, updates are idempotent-but-overwriting,
deletes are destructive. Inputs use a normalized snake_case vocabulary; the
client maps them to the wire Person shape (`names[].givenName`,
`emailAddresses[]`, computed `updatePersonFields` masks) and handles OAuth
entirely on its own.

Contacts are addressed by their full **resource name** exactly as the API
returns it — `people/c1234567890` (or `people/me` for the caller's own profile
in `get_contact`); groups by `contactGroups/<id>`; other contacts by
`otherContacts/<id>`.

**Field masks:** every read returns ONLY the fields named in
`person_fields`/`read_mask` (default: `names, emailAddresses, phoneNumbers,
organizations, memberships`) — an absent field may simply be unmasked, not
empty. `resourceName` and `etag` always come back.

## Contacts

| Tool | Description |
|---|---|
| `list_contacts` | Lists saved contacts (`people/me/connections`). `page_size` ≤ 1000, `page_token` pagination, `sort_order`. Incremental sync: `request_sync_token` → `nextSyncToken` → `sync_token`; an expired token (~7 days) fails with **410 EXPIRED_SYNC_TOKEN** — re-list in full (deleted contacts then carry `metadata.deleted=true`). |
| `search_contacts` | Prefix search over names, nicknames, emails, phones, organizations. Max 30 results, no pagination. The search cache lags writes by a few seconds; the documented **warmup request** (empty query) is sent automatically before the session's first search. |
| `get_contact` | One person by resource name with an explicit mask. Returns the `etag` that `update_contact` needs. |
| `batch_get_contacts` | Up to 200 people in one request (`people:batchGet`); per-entry `status` — one missing contact doesn't fail the rest. Prefer over get_contact loops (low per-user quota). |
| `create_contact` | Creates one contact from normalized fields (at least one required). The API does **not** deduplicate — after an ambiguous failure check before re-sending. Photos need `raw_request` (`updateContactPhoto`). |
| `update_contact` | Etag-guarded `PATCH :updateContact`. Every provided field group **replaces** the stored group (`emails: []` clears); `updatePersonFields` is computed from the provided groups. Missing `etag` is fetched automatically (one extra read); a concurrent edit fails with a 400 — re-read, retry. |
| `delete_contact` | Permanently deletes one contact. No undo through this API. |

## Contact groups

| Tool | Description |
|---|---|
| `list_contact_groups` | System groups (`contactGroups/myContacts`, `/starred`, ... — `SYSTEM_CONTACT_GROUP`) + user groups. Add `memberCount` to `group_fields` for sizes. |
| `get_contact_group` | One group; `max_members` > 0 also returns that many `memberResourceNames` (feed them to `batch_get_contacts`). |
| `create_contact_group` | Creates a user group (label). Names must be unique → 409 CONFLICT on duplicates. |
| `update_contact_group` | Renames a user group (`PUT`, etag-guarded like contacts; fetched when omitted). System groups can't be renamed. |
| `delete_contact_group` | Deletes a user group. `delete_contacts=true` **also permanently deletes every member contact** — the flag is forwarded only when explicitly set. |
| `modify_group_members` | Adds/removes members (`members:modify`, add+remove ≤ 1000 names). Response lists only problems (`notFoundResourceNames`, `canNotRemoveLastContactGroupResourceNames`); re-running converges. |

## Batch operations

| Tool | Description |
|---|---|
| `batch_create_contacts` | Up to 200 contacts in one request; atomic (one bad entry = nothing created). Returns `createdPeople[]`. |
| `batch_update_contacts` | Up to 200 updates; the wire `updateMask` is **shared** — computed as the union of every entry's groups, so a group provided by one entry and omitted by another is cleared on the latter. Missing etags fetched in one `batchGet`. Atomic. |
| `batch_delete_contacts` | Up to 500 permanent deletes in one request; atomic. |

Mutate batches must be sent **sequentially** per user — parallel batches slow down and fail.

## Other contacts (separate scope)

| Tool | Description |
|---|---|
| `list_other_contacts` | Lists (or, with `query`, searches) "Other contacts" — auto-saved addresses outside the saved list. Only `names`, `emailAddresses`, `phoneNumbers`, `photos`, `metadata` exist here. Requires the `contacts.other.readonly` scope. |
| `copy_other_contact` | The only write for Other contacts: copies one into My Contacts (`copy_mask` picks the fields) and returns the new `people/c...` person. Requires `contacts` **and** `contacts.other.readonly`. |

## Escape hatch

| Tool | Description |
|---|---|
| `raw_request` | Calls any People API v1 path directly (`GET`/`POST`/`PATCH`/`PUT`/`DELETE`, default GET) — contact photos (`:updateContactPhoto` / `:deleteContactPhoto`), `contactGroups:batchGet`, directory endpoints, explicit `sources=`. The path may carry a query string. A path resolving to a foreign origin is rejected (SSRF guard), so the Bearer token never leaves `people.googleapis.com`. |

## Notes

- **Retry policy:** 429 is retried with backoff for every method (the request was rejected
  before executing); 5xx and network errors are retried **only for GET** — replaying a write
  after an ambiguous failure could apply it twice.
- **OAuth:** access tokens are minted from the refresh token automatically, cached until ~60s
  before expiry, and re-minted once on a 401.
- **Quotas** are per-user and low (~90 reads and ~90 writes per minute on default People API
  quota) — prefer the batch tools over loops.
- **Scopes:** `contacts` (read/write), `contacts.readonly` (reads only),
  `contacts.other.readonly` (Other contacts). See [DEVELOPMENT.md](./DEVELOPMENT.md).

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GOOGLE_CONTACTS_CLIENT_ID` | yes* | — | OAuth2 client id (refresh flow). |
| `GOOGLE_CONTACTS_CLIENT_SECRET` | yes* | — | OAuth2 client secret (refresh flow). Secret. |
| `GOOGLE_CONTACTS_REFRESH_TOKEN` | yes* | — | OAuth2 refresh token (refresh flow). Secret. |
| `GOOGLE_CONTACTS_ACCESS_TOKEN` | yes* | — | Alternative: static access token (~1 h lifetime). Secret. |
| `GOOGLE_CONTACTS_API_BASE` | no | `https://people.googleapis.com` | API root override. |
| `GOOGLE_CONTACTS_TIMEOUT_MS` | no | `60000` | Per-request timeout, ms. |
| `GOOGLE_CONTACTS_MAX_RETRIES` | no | `3` | Retries on transient errors. |

\* Either the refresh triple together, or the static access token.
