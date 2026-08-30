# Google Contacts: Search contacts — MCP tool

**Google Contacts MCP tool:** Full-text prefix search over the user's saved contacts by names, emails, phones and organizations.

Technical name: `search_contacts`

## What task it solves

> I want to find a contact by name, email or phone.

Searches the saved contacts by names, nicknames, email addresses, phone numbers and organizations with prefix matching ("jo" finds "John").

## When to use it

Use it to look up a specific person before reading, updating, grouping or deleting them. For full exports or just-created contacts use [List contacts](./list-contacts.md).

## What to provide

- `query` — **required**. The search text.
- `read_mask` — **optional**. Fields to return; default `names, emailAddresses, phoneNumbers, organizations, memberships`.
- `page_size` — **optional**. Max matches, 1..30 (default 10).

## What it returns

`results[]`, each with a `person` carrying `resourceName`, `etag` and only the masked fields.

## What changes in Google Contacts

The tool reads Google Contacts data and does not change it.

## Example request

> Find the contact whose email starts with "ada@".

## Errors and limitations

Max 30 results and no pagination. The search cache lags writes by a few seconds and goes cold between sessions — the documented warmup request is sent automatically before the session's first search, but a contact created seconds ago may still be missing (fall back to list_contacts). "Other contacts" are not searched here. Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [List contacts](./list-contacts.md) — `list_contacts`
- [Get a contact](./get-contact.md) — `get_contact`
- [List or search Other contacts](./list-other-contacts.md) — `list_other_contacts`

## Technical details

- **Impact:** read-only
- **Group:** Contacts
- **Description source:** `search_contacts` registration in `src/tools/contacts.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
