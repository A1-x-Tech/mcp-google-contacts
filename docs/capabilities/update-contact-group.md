# Google Contacts: Rename a contact group — MCP tool

**Google Contacts MCP tool:** Renames a user-created contact group with etag concurrency protection.

Technical name: `update_contact_group`

## What task it solves

> I want to rename a contact label.

Renames a user-created group — the only mutable group field the API exposes.

## When to use it

Use it when the user wants a label called something else. It never touches membership or the member contacts.

## What to provide

- `resource_name` — **required**. `contactGroups/...` of a user group.
- `name` — **required**. The new unique name.
- `etag` — **optional**. From a recent get; fetched automatically when omitted.

## What it returns

The updated group.

## What changes in Google Contacts

The label's name changes everywhere it is shown; members are unaffected.

## Example request

> Rename the "Conf" label to "Conference 2026".

## Errors and limitations

System groups (myContacts, starred, ...) cannot be renamed — the API rejects them. A concurrent edit fails on the etag — re-read with get_contact_group and retry. Duplicate names fail with 409 CONFLICT. Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Get a contact group](./get-contact-group.md) — `get_contact_group`
- [Create a contact group](./create-contact-group.md) — `create_contact_group`
- [Delete a contact group](./delete-contact-group.md) — `delete_contact_group`

## Technical details

- **Impact:** destructive operation
- **Group:** Contact groups
- **Description source:** `update_contact_group` registration in `src/tools/groups.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
