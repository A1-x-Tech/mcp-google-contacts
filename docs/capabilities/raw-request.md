# Google Contacts: Raw Google People API call — MCP tool

**Google Contacts MCP tool:** Escape hatch that calls any Google People API v1 path directly for requests the typed tools don't cover.

Technical name: `raw_request`

## What task it solves

> I want to call a People API endpoint the typed tools don't expose.

Calls any People API v1 path directly with the server's Bearer token: contact photos, `contactGroups:batchGet`, directory endpoints, explicit `sources=` parameters.

## When to use it

Use it only when no typed tool covers the request — the typed tools carry the guardrails (etag handling, masks, warmup) that this tool leaves to you.

## What to provide

- `path` — **required**. Relative API path, e.g. `v1/people/c123:updateContactPhoto`; may carry a query string.
- `method` — **optional**. GET (default), POST, PATCH, PUT, DELETE.
- `body` — **optional**. JSON body for POST/PATCH/PUT.

## What it returns

The raw JSON the API responds with.

## What changes in Google Contacts

Whatever the chosen endpoint does — including permanent deletions. Treat every non-GET call as a real write and confirm destructive ones with the user.

## Example request

> Set this base64 image as the photo of people/c123 via updateContactPhoto.

## Errors and limitations

A path resolving to a foreign origin is rejected (SSRF guard) — the Bearer token never leaves people.googleapis.com. Field masks are query parameters; repeated parameters must be spelled out in the query string. Writes are never retried after ambiguous failures. Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Get a contact](./get-contact.md) — `get_contact`
- [Update a contact](./update-contact.md) — `update_contact`
- [List contact groups](./list-contact-groups.md) — `list_contact_groups`

## Technical details

- **Impact:** destructive operation
- **Group:** Additional API methods
- **Description source:** `raw_request` registration in `src/tools/raw.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
