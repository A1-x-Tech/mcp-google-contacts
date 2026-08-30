# Google Contacts: List contact groups — MCP tool

**Google Contacts MCP tool:** Lists the user's contact groups (labels), both system and user-created.

Technical name: `list_contact_groups`

## What task it solves

> I want to see my contact labels.

Lists system groups (`contactGroups/myContacts`, `/starred`, `/blocked`, ...) and user-created groups, each with `resourceName`, `etag`, `name` and `formattedName`.

## When to use it

Use it to discover group resource names before reading members, renaming, deleting or modifying membership, or to show the user their labels.

## What to provide

- `page_size` — **optional**. 1..1000, default 30.
- `page_token` — **optional**. `nextPageToken` from the previous page.
- `group_fields` — **optional**. Add `memberCount` for group sizes.
- `sync_token` — **optional**. Only changes since a previous list.

## What it returns

`contactGroups[]`, `nextPageToken`, `totalItems`, and `nextSyncToken` when applicable.

## What changes in Google Contacts

The tool reads Google Contacts data and does not change it.

## Example request

> Show all my contact labels with how many people are in each.

## Errors and limitations

Only user groups (`groupType: USER_CONTACT_GROUP`) can be renamed or deleted; system groups are managed by Google. Membership lives on each person's `memberships` field. Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Get a contact group](./get-contact-group.md) — `get_contact_group`
- [Create a contact group](./create-contact-group.md) — `create_contact_group`
- [Add/remove group members](./modify-group-members.md) — `modify_group_members`

## Technical details

- **Impact:** read-only
- **Group:** Contact groups
- **Description source:** `list_contact_groups` registration in `src/tools/groups.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
