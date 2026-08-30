# Google Contacts: Update a contact — MCP tool

**Google Contacts MCP tool:** Replaces chosen field groups on an existing contact with etag concurrency protection.

Technical name: `update_contact`

## What task it solves

> I want to change an existing contact's details.

Updates a contact by replacing the field groups you provide (names, emails, phones, ...) and leaving the rest untouched.

## When to use it

Use it to correct or extend one saved contact. For changing many contacts the same way, use [Update many contacts](./batch-update-contacts.md).

## What to provide

- `resource_name` — **required**. `people/c...`.
- `etag` — **optional**. From a recent read; fetched automatically when omitted (one extra read).
- The contact fields to replace — same vocabulary as create_contact; at least one required.

## What it returns

The updated person with only the `person_fields` requested.

## What changes in Google Contacts

Every provided group REPLACES the stored group wholesale: `emails: [{...}]` discards all other stored emails, `emails: []` clears them, omitted groups stay untouched. Scalar fields clear on an empty value: `nickname`, `notes` and `birthday` with `""`, `organization` with `{}`. This is why the tool is marked destructive — a careless update loses data.

## Example request

> Change Ada's work email to ada@newco.com but first show me her current emails.

## Errors and limitations

A concurrent edit between read and write fails with a 400 about the etag — re-read and retry with fresh data. Only `people/c...` contacts can be updated, not `people/me`. To append to a list, read first and send the merged list. Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Get a contact](./get-contact.md) — `get_contact`
- [Update many contacts](./batch-update-contacts.md) — `batch_update_contacts`
- [Delete a contact](./delete-contact.md) — `delete_contact`

## Technical details

- **Impact:** destructive operation
- **Group:** Contacts
- **Description source:** `update_contact` registration in `src/tools/contacts.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
