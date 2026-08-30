# Google Contacts: Get many contacts at once — MCP tool

**Google Contacts MCP tool:** Fetches up to 200 people in a single request instead of a get_contact loop.

Technical name: `batch_get_contacts`

## What task it solves

> I want to read many contacts in one call.

Fetches up to 200 people in ONE request (`people:batchGet`) — the quota-friendly way to hydrate a list of resource names (e.g. group members).

## When to use it

Use it whenever you have more than one resource name to read — the per-user read quota is low (~90/minute), so loops over get_contact waste it.

## What to provide

- `resource_names` — **required**. 1..200 `people/c...` names.
- `person_fields` — **optional**. Fields to return; default `names, emailAddresses, phoneNumbers, organizations, memberships`.

## What it returns

`responses[]` in request order, each with `requestedResourceName`, a per-entry `status`, and `person` with only the masked fields.

## What changes in Google Contacts

The tool reads Google Contacts data and does not change it.

## Example request

> Fetch the names and emails of these 40 contacts in one go.

## Errors and limitations

A missing contact fails only its own entry — check each `status` instead of assuming all succeeded. Max 200 names per call. Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Get a contact](./get-contact.md) — `get_contact`
- [Get a contact group](./get-contact-group.md) — `get_contact_group`
- [Update many contacts](./batch-update-contacts.md) — `batch_update_contacts`

## Technical details

- **Impact:** read-only
- **Group:** Contacts
- **Description source:** `batch_get_contacts` registration in `src/tools/contacts.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
