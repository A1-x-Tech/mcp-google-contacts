# Google Contacts: Get a contact group — MCP tool

**Google Contacts MCP tool:** Fetches one contact group, optionally with its member resource names.

Technical name: `get_contact_group`

## What task it solves

> I want to see who is in a contact group.

Fetches one group by resource name; with `max_members` > 0 it also returns that many member resource names.

## When to use it

Use it to read a group's details, obtain its `etag` before renaming, or list its members (then hydrate them with batch_get_contacts).

## What to provide

- `resource_name` — **required**. `contactGroups/...`.
- `max_members` — **optional**. How many `memberResourceNames` to include (0/omitted = none).
- `group_fields` — **optional**. e.g. add `memberCount`.

## What it returns

The group with `resourceName`, `etag`, `name`, `groupType`, and `memberResourceNames` when requested (`memberCount` tells the total).

## What changes in Google Contacts

The tool reads Google Contacts data and does not change it.

## Example request

> Who is in my "Friends" group? Show their names and emails.

## Errors and limitations

`memberResourceNames` are just ids — fetch the people with batch_get_contacts. A 404 means the group doesn't exist (check list_contact_groups). Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [List contact groups](./list-contact-groups.md) — `list_contact_groups`
- [Get many contacts at once](./batch-get-contacts.md) — `batch_get_contacts`
- [Rename a contact group](./update-contact-group.md) — `update_contact_group`

## Technical details

- **Impact:** read-only
- **Group:** Contact groups
- **Description source:** `get_contact_group` registration in `src/tools/groups.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
