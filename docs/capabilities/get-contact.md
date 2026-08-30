# Google Contacts: Get a contact — MCP tool

**Google Contacts MCP tool:** Fetches one person by resource name with an explicit field mask.

Technical name: `get_contact`

## What task it solves

> I want to read one contact's details.

Fetches one person (`people/c...` from list/search results, or `people/me` for the authenticated user's own profile) with exactly the fields you ask for.

## When to use it

Use it to read fields the compact default mask omits (addresses, birthdays, notes, urls, photos), or to obtain the current `etag` before an update.

## What to provide

- `resource_name` — **required**. `people/c...` or `people/me`.
- `person_fields` — **optional**. Fields to return; default `names, emailAddresses, phoneNumbers, organizations, memberships`.

## What it returns

The person object with `resourceName`, `etag` and only the masked fields.

## What changes in Google Contacts

The tool reads Google Contacts data and does not change it.

## Example request

> Show me everything stored for people/c1234567890, including addresses and birthday.

## Errors and limitations

Only masked fields come back — ask for what you need. A 404 means the resource name is wrong or the contact was deleted. Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Get many contacts at once](./batch-get-contacts.md) — `batch_get_contacts`
- [Update a contact](./update-contact.md) — `update_contact`
- [Delete a contact](./delete-contact.md) — `delete_contact`

## Technical details

- **Impact:** read-only
- **Group:** Contacts
- **Description source:** `get_contact` registration in `src/tools/contacts.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
