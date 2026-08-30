# Google Contacts: Copy an Other contact into My Contacts — MCP tool

**Google Contacts MCP tool:** Turns an auto-saved "Other contact" into a real, editable saved contact.

Technical name: `copy_other_contact`

## What task it solves

> I want to save an auto-saved address as a real contact.

Copies an "Other contact" into the user's saved contacts — the only write the API offers for Other contacts.

## When to use it

Use it after list_other_contacts finds the person, when the user wants them in their real contact list (required before editing or grouping them).

## What to provide

- `resource_name` — **required**. `otherContacts/...` from list_other_contacts.
- `copy_mask` — **optional**. Which fields carry over: names, emailAddresses, phoneNumbers (default all three).
- `read_mask` — **optional**. Fields to return on the new person.

## What it returns

The NEW saved person — use its `resourceName` (`people/c...`) for further edits; the `otherContacts/...` entry remains.

## What changes in Google Contacts

A new saved contact appears with the copied fields; the auto-saved entry is not removed.

## Example request

> Save bob@example.com from my other contacts as a real contact and add him to "Suppliers".

## Errors and limitations

Copying the same entry twice creates duplicate saved contacts. Requires BOTH the `contacts` and `contacts.other.readonly` OAuth scopes. Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [List or search Other contacts](./list-other-contacts.md) — `list_other_contacts`
- [Update a contact](./update-contact.md) — `update_contact`
- [Add/remove group members](./modify-group-members.md) — `modify_group_members`

## Technical details

- **Impact:** changes data
- **Group:** Other contacts
- **Description source:** `copy_other_contact` registration in `src/tools/other.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
