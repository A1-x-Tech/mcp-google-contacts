# Google Contacts: Update many contacts — MCP tool

**Google Contacts MCP tool:** Updates up to 200 contacts in a single atomic request with a shared update mask.

Technical name: `batch_update_contacts`

## What task it solves

> I want to change many contacts in one go.

Updates up to 200 contacts in ONE request — each entry names a contact and the field groups to replace on it.

## When to use it

Use it for bulk edits (e.g. re-labeling company names after a merger). For a single contact use update_contact.

## What to provide

- `updates` — **required**. 1..200 entries: `resource_name`, optional `etag` (fetched automatically in one batch read when omitted), and the fields to replace.
- `read_mask` — **optional**. Fields to return for the updated people.

## What it returns

`updateResult` keyed by resource name, each with the updated person.

## What changes in Google Contacts

Provided field groups are REPLACED on the listed contacts. The wire update mask is shared by the whole batch (the union of every entry's groups): a group one entry provides and another omits gets CLEARED on the omitting one — give every entry the same groups or split the batch.

## Example request

> Set the organization "NewCo" on all 40 of these contacts.

## Errors and limitations

Atomic: one stale etag or invalid entry fails the whole request — re-read and retry. Send mutate batches sequentially, never in parallel; never blindly re-send after an ambiguous failure. Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Update a contact](./update-contact.md) — `update_contact`
- [Get many contacts at once](./batch-get-contacts.md) — `batch_get_contacts`
- [Create many contacts](./batch-create-contacts.md) — `batch_create_contacts`

## Technical details

- **Impact:** destructive operation
- **Group:** Batch operations
- **Description source:** `batch_update_contacts` registration in `src/tools/batch.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
