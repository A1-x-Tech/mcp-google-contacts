# Google Contacts: Delete a contact — MCP tool

**Google Contacts MCP tool:** Permanently deletes one contact from the user's Google Contacts.

Technical name: `delete_contact`

## What task it solves

> I want to remove a contact.

Permanently deletes one contact by resource name.

## When to use it

Use it only when the user explicitly wants the person gone from their contacts. To remove someone from a group while keeping the contact, use [Add/remove group members](./modify-group-members.md).

## What to provide

- `resource_name` — **required**. `people/c...` of the contact to delete.

## What it returns

An empty success response.

## What changes in Google Contacts

The contact is permanently removed from the user's saved contacts.

## Example request

> Delete the duplicate contact people/c987 — I confirmed it's the copy.

## Errors and limitations

There is no undo through this API — verify the right contact with get_contact and confirm with the user first. For many contacts use batch_delete_contacts. A 404 means the contact is already gone. Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Get a contact](./get-contact.md) — `get_contact`
- [Delete many contacts](./batch-delete-contacts.md) — `batch_delete_contacts`
- [Add/remove group members](./modify-group-members.md) — `modify_group_members`

## Technical details

- **Impact:** destructive operation
- **Group:** Contacts
- **Description source:** `delete_contact` registration in `src/tools/contacts.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
