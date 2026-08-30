# Google Contacts: Create a contact — MCP tool

**Google Contacts MCP tool:** Creates one new contact in the user's Google Contacts from normalized fields.

Technical name: `create_contact`

## What task it solves

> I want to add a new contact.

Creates one contact from normalized fields (name, emails, phones, addresses, organization, birthday, notes, urls) and returns the created person.

## When to use it

Use it to save a single new person. For importing many people, use [Create many contacts](./batch-create-contacts.md) instead — one request instead of N.

## What to provide

At least one contact field: `given_name`, `family_name`, `middle_name`, `prefix`, `suffix`, `nickname`, `emails[]`, `phones[]`, `addresses[]`, `organization`, `birthday` (`YYYY-MM-DD` or `MM-DD`), `notes`, `urls[]`. Optional `person_fields` picks the returned fields.

## What it returns

The created person — save its `resourceName` (`people/c...`) to update, group or delete it later.

## What changes in Google Contacts

A new contact appears in the user's saved contacts immediately.

## Example request

> Add Ada Lovelace, ada@example.com, +1 555 0100, company "Analytical Engines".

## Errors and limitations

The API does not deduplicate: calling twice with the same data creates two contacts — after a timeout or 5xx, check with search or list before re-sending (writes are never auto-retried). Contact photos cannot be set here (raw_request → `:updateContactPhoto`). Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Create many contacts](./batch-create-contacts.md) — `batch_create_contacts`
- [Update a contact](./update-contact.md) — `update_contact`
- [Add/remove group members](./modify-group-members.md) — `modify_group_members`

## Technical details

- **Impact:** changes data
- **Group:** Contacts
- **Description source:** `create_contact` registration in `src/tools/contacts.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
