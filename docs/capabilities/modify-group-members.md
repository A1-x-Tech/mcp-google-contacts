# Google Contacts: Add/remove group members — MCP tool

**Google Contacts MCP tool:** Adds and removes contacts to/from a contact group in a single call.

Technical name: `modify_group_members`

## What task it solves

> I want to change which contacts carry a label.

Adds and/or removes contacts (`people/c...`) to/from a group in one call.

## When to use it

Use it to label or unlabel contacts — including starring via `contactGroups/starred`. Removing a member does NOT delete the contact.

## What to provide

- `resource_name` — **required**. `contactGroups/...`.
- `add` — **optional**. Contacts to add.
- `remove` — **optional**. Contacts to remove.

At least one of `add`/`remove` is required; the API caps add+remove at 1000 names combined.

## What it returns

Only problems: `notFoundResourceNames` and `canNotRemoveLastContactGroupResourceNames`. An empty object means full success.

## What changes in Google Contacts

The listed contacts gain or lose the label; the contacts themselves are untouched.

## Example request

> Add these three contacts to "Conference 2026" and remove people/c42 from it.

## Errors and limitations

Re-running the same call converges (already-member / already-removed are not errors). Membership in a contact's last group cannot always be removed (see `canNotRemoveLastContactGroupResourceNames`). Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Get a contact group](./get-contact-group.md) — `get_contact_group`
- [Create a contact group](./create-contact-group.md) — `create_contact_group`
- [Delete a contact](./delete-contact.md) — `delete_contact`

## Technical details

- **Impact:** destructive operation
- **Group:** Contact groups
- **Description source:** `modify_group_members` registration in `src/tools/groups.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
