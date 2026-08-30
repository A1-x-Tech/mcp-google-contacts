# Google Contacts MCP capabilities

This catalog contains 19 public pages—one for every registered MCP tool in `mcp-google-contacts`. Each page starts with the user's task, explains the result, and states whether the call changes real data.

Use this catalog to choose a ready-made capability. Full parameter schemas and API response details remain in the [technical reference](../TOOLS.md).

## Contacts

- [List contacts](./list-contacts.md) — Lists the user's saved contacts with pagination, sorting and incremental-sync tokens. **Impact:** read-only.
- [Search contacts](./search-contacts.md) — Full-text prefix search over saved contacts by names, emails, phones and organizations. **Impact:** read-only.
- [Get a contact](./get-contact.md) — Fetches one person by resource name with an explicit field mask. **Impact:** read-only.
- [Get many contacts at once](./batch-get-contacts.md) — Fetches up to 200 people in a single request. **Impact:** read-only.
- [Create a contact](./create-contact.md) — Creates one new contact from normalized fields. **Impact:** changes data.
- [Update a contact](./update-contact.md) — Replaces chosen field groups on an existing contact, etag-guarded. **Impact:** destructive operation.
- [Delete a contact](./delete-contact.md) — Permanently deletes one contact. **Impact:** destructive operation.

## Contact groups

- [List contact groups](./list-contact-groups.md) — Lists system and user-created groups (labels). **Impact:** read-only.
- [Get a contact group](./get-contact-group.md) — One group, optionally with member resource names. **Impact:** read-only.
- [Create a contact group](./create-contact-group.md) — Creates a new user group (label). **Impact:** changes data.
- [Rename a contact group](./update-contact-group.md) — Renames a user-created group, etag-guarded. **Impact:** destructive operation.
- [Delete a contact group](./delete-contact-group.md) — Deletes a user group; optionally its member contacts too. **Impact:** destructive operation.
- [Add/remove group members](./modify-group-members.md) — Changes which contacts carry a label, in one call. **Impact:** destructive operation.

## Batch operations

- [Create many contacts](./batch-create-contacts.md) — Up to 200 contacts in one atomic request. **Impact:** changes data.
- [Update many contacts](./batch-update-contacts.md) — Up to 200 updates with a shared update mask, atomic. **Impact:** destructive operation.
- [Delete many contacts](./batch-delete-contacts.md) — Up to 500 permanent deletes, atomic. **Impact:** destructive operation.

## Other contacts

- [List or search Other contacts](./list-other-contacts.md) — Auto-saved addresses outside the saved list. **Impact:** read-only.
- [Copy an Other contact into My Contacts](./copy-other-contact.md) — Turns an auto-saved address into a real contact. **Impact:** changes data.

## Additional API methods

- [Raw Google People API call](./raw-request.md) — Escape hatch for endpoints the typed tools don't cover. **Impact:** destructive operation.

## For maintainers and publishers

- [MCP capability documentation contract](../CAPABILITY-DOCUMENTATION.md)
- [Technical tool reference](../TOOLS.md)
- [GitHub repository](https://github.com/A1-x-Tech/mcp-google-contacts)
