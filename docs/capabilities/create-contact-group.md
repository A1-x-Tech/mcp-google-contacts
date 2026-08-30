# Google Contacts: Create a contact group — MCP tool

**Google Contacts MCP tool:** Creates a new user contact group (label) for organizing contacts.

Technical name: `create_contact_group`

## What task it solves

> I want to create a new contact label.

Creates a user contact group with the given name and returns it.

## When to use it

Use it before organizing contacts under a new label; then add members with modify_group_members.

## What to provide

- `name` — **required**. The label name shown in Google Contacts; must be unique for the user.

## What it returns

The new group — save its `resourceName` (`contactGroups/...`) for membership and management calls.

## What changes in Google Contacts

A new empty label appears in the user's Google Contacts immediately.

## Example request

> Create a "Conference 2026" label and add these five contacts to it.

## Errors and limitations

A duplicate name fails with 409 CONFLICT. The API does not deduplicate retries — after an ambiguous failure check list_contact_groups before re-sending. Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Add/remove group members](./modify-group-members.md) — `modify_group_members`
- [Rename a contact group](./update-contact-group.md) — `update_contact_group`
- [Delete a contact group](./delete-contact-group.md) — `delete_contact_group`

## Technical details

- **Impact:** changes data
- **Group:** Contact groups
- **Description source:** `create_contact_group` registration in `src/tools/groups.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
