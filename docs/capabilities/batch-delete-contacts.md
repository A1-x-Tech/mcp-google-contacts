# Google Contacts: Delete many contacts — MCP tool

**Google Contacts MCP tool:** Permanently deletes up to 500 contacts in a single atomic request.

Technical name: `batch_delete_contacts`

## What task it solves

> I want to remove many contacts at once.

Permanently deletes up to 500 contacts in ONE request.

## When to use it

Use it for confirmed bulk cleanups (duplicates, imports gone wrong). List the exact contacts back to the user and get confirmation before calling.

## What to provide

- `resource_names` — **required**. 1..500 `people/c...` names to delete permanently.

## What it returns

An empty success response.

## What changes in Google Contacts

Every listed contact is permanently removed from the user's saved contacts.

## Example request

> I confirmed the duplicates — delete these 12 contacts.

## Errors and limitations

No undo through this API. Atomic: one unknown resource name fails the whole request and nothing is deleted. To only unlabel contacts, use modify_group_members instead. Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Delete a contact](./delete-contact.md) — `delete_contact`
- [Add/remove group members](./modify-group-members.md) — `modify_group_members`
- [Get many contacts at once](./batch-get-contacts.md) — `batch_get_contacts`

## Technical details

- **Impact:** destructive operation
- **Group:** Batch operations
- **Description source:** `batch_delete_contacts` registration in `src/tools/batch.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
