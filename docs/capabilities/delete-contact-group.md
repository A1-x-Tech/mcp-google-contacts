# Google Contacts: Delete a contact group — MCP tool

**Google Contacts MCP tool:** Permanently deletes a user contact group, optionally together with its member contacts.

Technical name: `delete_contact_group`

## What task it solves

> I want to delete a contact label.

Permanently deletes a user-created group. By default the member contacts survive and only lose the label.

## When to use it

Use it to remove a label that is no longer needed. Reach for `delete_contacts=true` only when the user explicitly wants every member contact permanently deleted too.

## What to provide

- `resource_name` — **required**. `contactGroups/...` of a user group.
- `delete_contacts` — **optional**. `true` ALSO permanently deletes all member contacts (dangerous; default false).

## What it returns

An empty success response.

## What changes in Google Contacts

The label disappears. With `delete_contacts=true`, every member contact is permanently deleted as well — confirm the member list with the user first.

## Example request

> Delete the "Old leads" label but keep the people in my contacts.

## Errors and limitations

No undo through this API. System groups cannot be deleted. Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Get a contact group](./get-contact-group.md) — `get_contact_group`
- [Add/remove group members](./modify-group-members.md) — `modify_group_members`
- [Delete many contacts](./batch-delete-contacts.md) — `batch_delete_contacts`

## Technical details

- **Impact:** destructive operation
- **Group:** Contact groups
- **Description source:** `delete_contact_group` registration in `src/tools/groups.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
