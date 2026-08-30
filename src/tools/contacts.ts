import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleContactsClient } from "../client.js";
import {
  contactFieldsShape,
  DESTRUCTIVE,
  fail,
  ok,
  personFieldsSchema,
  personResourceNameSchema,
  READ_ONLY,
  toContactFields,
  UPDATE,
  WRITE,
} from "./util.js";

export function registerContactTools(server: McpServer, client: GoogleContactsClient): void {
  server.registerTool(
    "list_contacts",
    {
      title: "List contacts",
      annotations: READ_ONLY,
      description:
        "Lists the account's saved contacts (People API people/me/connections): connections[] of Person objects with resourceName, etag and the requested person_fields (default names, emailAddresses, phoneNumbers, organizations, memberships — an absent field may be unmasked, not empty), plus nextPageToken, totalItems and (when requested) nextSyncToken. page_size up to 1000 (default 100); paginate with page_token. For incremental polling set request_sync_token=true on a full listing, store nextSyncToken, and pass it as sync_token next time to get only changed/deleted people (deleted ones carry metadata.deleted=true); an expired token (~7 days) fails with HTTP 410 EXPIRED_SYNC_TOKEN — re-list without sync_token. Covers only the user's own saved contacts — not the Workspace directory and not auto-saved addresses (see list_other_contacts).",
      inputSchema: {
        person_fields: personFieldsSchema().optional(),
        page_size: z.number().int().min(1).max(1000).optional().describe("Contacts per page (1..1000, default 100)."),
        page_token: z.string().optional().describe("nextPageToken from the previous page."),
        sort_order: z
          .enum(["LAST_MODIFIED_ASCENDING", "LAST_MODIFIED_DESCENDING", "FIRST_NAME_ASCENDING", "LAST_NAME_ASCENDING"])
          .optional()
          .describe("Sort order (default LAST_MODIFIED_ASCENDING). Ignored when sync_token is set."),
        request_sync_token: z
          .boolean()
          .optional()
          .describe("Ask for a nextSyncToken on the last page (for later incremental syncs)."),
        sync_token: z
          .string()
          .optional()
          .describe("Sync token from a previous listing — returns only people changed since then."),
      },
    },
    async ({ person_fields, page_size, page_token, sort_order, request_sync_token, sync_token }) => {
      try {
        return ok(
          await client.listContacts({
            personFields: person_fields,
            pageSize: page_size,
            pageToken: page_token,
            sortOrder: sort_order,
            requestSyncToken: request_sync_token,
            syncToken: sync_token,
          }),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "search_contacts",
    {
      title: "Search contacts",
      annotations: READ_ONLY,
      description:
        "Searches the account's saved contacts by prefix match on names, nicknames, emails, phones and organizations (People API people:searchContacts). Returns results[] of { person } with the requested read_mask fields. Max 30 results, no pagination — this is a quick lookup, not an export; use list_contacts to enumerate everything. The search index lags writes by seconds to minutes: a contact created or updated moments ago may be missing here even though list_contacts and get_contact already see it (the documented cache-warmup request is sent automatically before the session's first search, but the lag is server-side). Searches only the user's own saved contacts.",
      inputSchema: {
        query: z.string().min(1).describe('The search text, e.g. a name prefix ("Ann"), email or phone fragment.'),
        read_mask: personFieldsSchema().optional(),
        page_size: z.number().int().min(1).max(30).optional().describe("Max results (1..30, API cap; default 10)."),
      },
    },
    async ({ query, read_mask, page_size }) => {
      try {
        return ok(await client.searchContacts({ query, readMask: read_mask, pageSize: page_size }));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "get_contact",
    {
      title: "Get a contact",
      annotations: READ_ONLY,
      description:
        'Fetches one contact by resource name ("people/c...", or "people/me" for the signed-in user\'s own profile) with an explicit field mask. Returns a Person with resourceName, etag and the requested person_fields (default names, emailAddresses, phoneNumbers, organizations, memberships). The etag in the result is what update_contact needs to change this contact safely; memberships list the contact\'s groups as contactGroups/<id> resource names.',
      inputSchema: {
        resource_name: personResourceNameSchema(),
        person_fields: personFieldsSchema().optional(),
      },
    },
    async ({ resource_name, person_fields }) => {
      try {
        return ok(await client.getContact(resource_name, person_fields));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "batch_get_contacts",
    {
      title: "Get many contacts at once",
      annotations: READ_ONLY,
      description:
        "Fetches up to 200 contacts in one call (People API people:batchGet) — far cheaper against the tight per-user quota than a get_contact loop. Returns responses[], one per requested resource name IN THE SAME ORDER, each { requestedResourceName, status, person }; a missing contact gets a NOT_FOUND status in its own entry instead of failing the whole call, so check per-entry status. person_fields works exactly like in get_contact.",
      inputSchema: {
        resource_names: z
          .array(personResourceNameSchema())
          .min(1)
          .max(200)
          .describe("The contacts to fetch (1..200 people/<id> resource names)."),
        person_fields: personFieldsSchema().optional(),
      },
    },
    async ({ resource_names, person_fields }) => {
      try {
        return ok(await client.batchGetContacts(resource_names, person_fields));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "create_contact",
    {
      title: "Create a contact",
      annotations: WRITE,
      description:
        "Creates a new contact in the account's Google Contacts and returns the created Person (resourceName, etag and the person_fields mask — use the resourceName for every later call). Provide any subset of the normalized fields: name parts, nickname, emails[], phones[], addresses[], organization, birthday, notes, urls[]; at least one is required. The API has NO duplicate detection — creating the same contact twice yields two contacts, so after an ambiguous failure (timeout/5xx; never auto-retried) check via search/list before re-sending. A just-created contact appears in list_contacts/get_contact immediately but reaches the search_contacts index with a delay. Contact photos need raw_request (updateContactPhoto).",
      inputSchema: {
        ...contactFieldsShape(),
        person_fields: personFieldsSchema().optional(),
      },
    },
    async (args) => {
      try {
        return ok(await client.createContact(toContactFields(args), args.person_fields));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "update_contact",
    {
      title: "Update a contact",
      annotations: UPDATE,
      description:
        "Updates an existing contact and returns the updated Person. Only the provided fields are touched (updatePersonFields is computed automatically), but each provided field group is REPLACED AS A WHOLE: passing emails replaces all emails ([] clears them), passing any name part rewrites the whole name, and scalar fields clear on an empty value (\"\" for nickname/notes/birthday, {} for organization) — fetch current values with get_contact first and send complete groups, or data is silently dropped. Updates are etag-guarded: pass the etag from get_contact to fail cleanly (HTTP 400) if someone edited the contact meanwhile, or omit it and the current etag is fetched automatically (one extra read; last-write-wins). At least one contact field is required.",
      inputSchema: {
        resource_name: personResourceNameSchema(),
        etag: z
          .string()
          .optional()
          .describe("The contact's etag from get_contact — omit to auto-fetch the current one."),
        ...contactFieldsShape(),
        person_fields: personFieldsSchema().optional(),
      },
    },
    async (args) => {
      try {
        return ok(
          await client.updateContact({
            resourceName: args.resource_name,
            etag: args.etag,
            fields: toContactFields(args),
            personFields: args.person_fields,
          }),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "delete_contact",
    {
      title: "Delete a contact",
      annotations: DESTRUCTIVE,
      description:
        "Permanently deletes one contact from the account's Google Contacts. There is no undo through this API (the Google Contacts UI keeps its own 30-day trash, but nothing here reads or restores it) — verify the resource_name with get_contact before deleting. Returns an empty result on success. After an ambiguous failure (timeout/5xx; never auto-retried) check with get_contact before re-sending: the delete may already have happened, and a second attempt then fails with 404.",
      inputSchema: {
        resource_name: personResourceNameSchema(),
      },
    },
    async ({ resource_name }) => {
      try {
        return ok(await client.deleteContact(resource_name));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
