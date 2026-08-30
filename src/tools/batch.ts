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
  toContactFields,
  UPDATE,
  WRITE,
} from "./util.js";

export function registerBatchTools(server: McpServer, client: GoogleContactsClient): void {
  server.registerTool(
    "batch_create_contacts",
    {
      title: "Create many contacts at once",
      annotations: WRITE,
      description:
        "Creates up to 200 contacts in one call (People API people:batchCreateContacts). Each entry takes the same normalized fields as create_contact (name parts, emails[], phones[], addresses[], organization, birthday, notes, urls[]) and needs at least one. Returns createdPeople[] with each new resourceName. The call is atomic — a validation error anywhere creates nothing — but after an AMBIGUOUS failure (timeout/5xx; never auto-retried) the batch may still have committed: check via list_contacts before re-sending, or every contact gets created twice (the API has no duplicate detection). Send mutate batches sequentially, never in parallel — that is also how the per-user write quota stretches furthest.",
      inputSchema: {
        contacts: z
          .array(z.object(contactFieldsShape()))
          .min(1)
          .max(200)
          .describe("The contacts to create (1..200), each with the create_contact field set."),
        read_mask: personFieldsSchema().optional(),
      },
    },
    async ({ contacts, read_mask }) => {
      try {
        return ok(
          await client.batchCreateContacts(
            contacts.map((c) => toContactFields(c)),
            read_mask,
          ),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "batch_update_contacts",
    {
      title: "Update many contacts at once",
      annotations: UPDATE,
      description:
        "Updates up to 200 contacts in one call (People API people:batchUpdateContacts). Each entry names a contact (resource_name, optional etag — missing etags are auto-fetched in ONE extra batchGet read) plus the same normalized fields as update_contact. CAUTION — the API applies ONE shared update mask to the whole batch, computed here as the union of every entry's provided field groups: a group that one entry provides and another omits is CLEARED on the omitting entry. Safest is to give every entry the same set of fields; each provided group replaces its stored group as a whole, exactly like update_contact. Atomic per request; a stale etag fails the whole batch with 400 — re-read and retry deliberately, never blindly.",
      inputSchema: {
        updates: z
          .array(
            z.object({
              resource_name: personResourceNameSchema(),
              etag: z.string().optional().describe("The contact's current etag — omit to auto-fetch."),
              ...contactFieldsShape(),
            }),
          )
          .min(1)
          .max(200)
          .describe("The updates (1..200) — give every entry the same set of contact fields (shared mask)."),
        read_mask: personFieldsSchema().optional(),
      },
    },
    async ({ updates, read_mask }) => {
      try {
        return ok(
          await client.batchUpdateContacts(
            updates.map((u) => ({
              resourceName: u.resource_name,
              etag: u.etag,
              fields: toContactFields(u),
            })),
            read_mask,
          ),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "batch_delete_contacts",
    {
      title: "Delete many contacts at once",
      annotations: DESTRUCTIVE,
      description:
        "Permanently deletes up to 500 contacts in one call (People API people:batchDeleteContacts). There is no undo through this API — list the exact resource names first (batch_get_contacts shows what each one is) and treat the call as final. Returns an empty result on success; atomic per request. After an ambiguous failure (timeout/5xx; never auto-retried) check which contacts still exist via batch_get_contacts instead of re-sending — the deletes may have committed, and a second call then reports NOT_FOUND.",
      inputSchema: {
        resource_names: z
          .array(personResourceNameSchema())
          .min(1)
          .max(500)
          .describe("The contacts to delete permanently (1..500 people/<id> resource names)."),
      },
    },
    async ({ resource_names }) => {
      try {
        return ok(await client.batchDeleteContacts(resource_names));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
