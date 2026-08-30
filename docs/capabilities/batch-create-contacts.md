# Google Contacts: Create many contacts — MCP tool

**Google Contacts MCP tool:** Creates up to 200 contacts in a single atomic request.

Technical name: `batch_create_contacts`

## What task it solves

> I want to import many contacts at once.

Creates up to 200 contacts in ONE request, each described with the same normalized fields as create_contact.

## When to use it

Use it for any import of more than one contact — the per-user write quota (~90/minute) makes create_contact loops slow and wasteful.

## What to provide

- `contacts` — **required**. 1..200 entries, each with at least one field (names, emails, phones, ...).
- `read_mask` — **optional**. Fields to return for the created people.

## What it returns

`createdPeople[]` with each new person and its `resourceName`.

## What changes in Google Contacts

All listed contacts appear in the user's saved contacts at once.

## Example request

> Import these 25 people from the spreadsheet into my contacts.

## Errors and limitations

The batch is atomic: one invalid entry fails the whole request and nothing is created. Send mutate batches sequentially, never in parallel. The API does not deduplicate, and writes are never auto-retried — after a timeout/5xx check what actually landed before re-sending. Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Create a contact](./create-contact.md) — `create_contact`
- [Update many contacts](./batch-update-contacts.md) — `batch_update_contacts`
- [Delete many contacts](./batch-delete-contacts.md) — `batch_delete_contacts`

## Technical details

- **Impact:** changes data
- **Group:** Batch operations
- **Description source:** `batch_create_contacts` registration in `src/tools/batch.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
