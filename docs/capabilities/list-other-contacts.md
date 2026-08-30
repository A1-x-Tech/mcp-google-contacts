# Google Contacts: List or search Other contacts — MCP tool

**Google Contacts MCP tool:** Lists or searches "Other contacts" — addresses Google auto-saved from the user's interactions.

Technical name: `list_other_contacts`

## What task it solves

> I want to see people I've emailed but never saved.

Lists (or, with `query`, searches) "Other contacts" — the auto-saved addresses that live outside the saved contact list.

## When to use it

Use it when a person the user has corresponded with is missing from list_contacts/search_contacts — they are often here. Follow up with copy_other_contact to make one a real contact.

## What to provide

- `query` — **optional**. Search text; switches to search mode (max 30 results, no pagination or sync).
- `read_mask` — **optional**. Only `names`, `emailAddresses`, `phoneNumbers`, `photos`, `metadata` exist here.
- `page_size`, `page_token`, `request_sync_token`, `sync_token` — **optional**, listing mode only.

## What it returns

`otherContacts[]` (or `results[]` when searching) with `otherContacts/...` resource names.

## What changes in Google Contacts

The tool reads Google Contacts data and does not change it.

## Example request

> Find bob@ among the people I've emailed but never saved.

## Errors and limitations

Requires the `contacts.other.readonly` OAuth scope — a 403 means the refresh token was minted without it. Other contacts are read-only; the only write is copying one into My Contacts. Expired sync tokens fail with 410 — re-list in full. Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Copy an Other contact into My Contacts](./copy-other-contact.md) — `copy_other_contact`
- [Search contacts](./search-contacts.md) — `search_contacts`
- [List contacts](./list-contacts.md) — `list_contacts`

## Technical details

- **Impact:** read-only
- **Group:** Other contacts
- **Description source:** `list_other_contacts` registration in `src/tools/other.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
