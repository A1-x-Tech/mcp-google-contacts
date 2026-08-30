# Google Contacts: List contacts — MCP tool

**Google Contacts MCP tool:** Lists the user's saved contacts with pagination, sorting and incremental-sync tokens.

Technical name: `list_contacts`

## What task it solves

> I want to list my saved contacts.

Returns the user's saved contacts (connections): each person carries `resourceName` (`people/c...` — the id every other tool takes), `etag`, and only the requested fields.

## When to use it

Use it to browse or export the contact list, to find a contact when search is not precise enough, or to run incremental sync with sync tokens. For text lookup prefer [Search contacts](./search-contacts.md).

## What to provide

- `person_fields` — **optional**. Fields to return; default `names, emailAddresses, phoneNumbers, organizations, memberships`.
- `page_size` — **optional**. 1..1000, default 100.
- `page_token` — **optional**. `nextPageToken` from the previous page.
- `sort_order` — **optional**. `LAST_MODIFIED_ASCENDING` (default), `LAST_MODIFIED_DESCENDING`, `FIRST_NAME_ASCENDING`, `LAST_NAME_ASCENDING`.
- `request_sync_token` / `sync_token` — **optional**. Incremental-sync controls.

## What it returns

`connections[]` (people with only the masked fields), `nextPageToken`, `totalItems`, and `nextSyncToken` when requested.

## What changes in Google Contacts

The tool reads Google Contacts data and does not change it.

## Example request

> List my contacts sorted by first name, 50 per page.

## Errors and limitations

The API returns ONLY the masked fields — an absent field may simply be unmasked, not empty. Sync tokens expire after about 7 days: a 410 EXPIRED_SYNC_TOKEN means re-list in full. There is no text filter here. Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Search contacts](./search-contacts.md) — `search_contacts`
- [Get a contact](./get-contact.md) — `get_contact`
- [Get many contacts at once](./batch-get-contacts.md) — `batch_get_contacts`

## Technical details

- **Impact:** read-only
- **Group:** Contacts
- **Description source:** `list_contacts` registration in `src/tools/contacts.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
