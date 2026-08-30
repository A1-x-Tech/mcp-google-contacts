import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleContactsClient } from "../client.js";
import {
  copyMaskSchema,
  fail,
  ok,
  otherContactFieldsSchema,
  otherContactResourceNameSchema,
  personFieldsSchema,
  READ_ONLY,
  WRITE,
} from "./util.js";

export function registerOtherContactTools(server: McpServer, client: GoogleContactsClient): void {
  server.registerTool(
    "list_other_contacts",
    {
      title: "List or search Other contacts",
      annotations: READ_ONLY,
      description:
        "Lists 'Other contacts' — addresses Google auto-saved from the user's email interactions; they are NOT in the saved contact list and never appear in list_contacts/search_contacts. Give query to search them instead of listing (prefix match, max 30 results, no pagination — the warmup request is sent automatically before the session's first search); without query it lists with page_token pagination (page_size up to 1000) and optional sync tokens (request_sync_token/sync_token; expired ones fail with 410 — re-list in full). Only names, emailAddresses, phoneNumbers, photos and metadata exist here. Other contacts are read-only: to edit one, first make it a real contact with copy_other_contact. Requires the contacts.other.readonly OAuth scope — a 403 means the refresh token was minted without it.",
      inputSchema: {
        query: z.string().min(1).optional().describe("Search text; when set, page_token and sync tokens are invalid."),
        read_mask: otherContactFieldsSchema().optional(),
        page_size: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .optional()
          .describe("Page size when listing (1..1000, default 100); max matches when searching (1..30)."),
        page_token: z.string().optional().describe("nextPageToken from the previous page (listing only)."),
        request_sync_token: z.boolean().optional().describe("Ask for a nextSyncToken (listing only)."),
        sync_token: z.string().optional().describe("Return only changes since this token (listing only)."),
      },
    },
    async ({ query, read_mask, page_size, page_token, request_sync_token, sync_token }) => {
      try {
        if (query !== undefined) {
          if (page_token !== undefined || request_sync_token !== undefined || sync_token !== undefined) {
            return fail(
              new Error("query cannot be combined with page_token or sync tokens — search has neither pagination nor sync."),
            );
          }
          if (page_size !== undefined && page_size > 30) {
            return fail(new Error("page_size must be 30 or less when searching."));
          }
          return ok(await client.searchOtherContacts({ query, readMask: read_mask, pageSize: page_size }));
        }
        return ok(
          await client.listOtherContacts({
            readMask: read_mask,
            pageSize: page_size,
            pageToken: page_token,
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
    "copy_other_contact",
    {
      title: "Copy an Other contact into My Contacts",
      annotations: WRITE,
      description:
        "Copies an 'Other contact' (from list_other_contacts) into the user's saved contacts — the only write that exists for Other contacts. copy_mask picks which fields carry over (names, emailAddresses, phoneNumbers; default all three). Returns the NEW saved person — use its resourceName ('people/c...') for further edits; the original otherContacts entry remains. Copying the same entry twice creates duplicate saved contacts. Requires BOTH the contacts and contacts.other.readonly OAuth scopes.",
      inputSchema: {
        resource_name: otherContactResourceNameSchema(),
        copy_mask: copyMaskSchema().optional(),
        read_mask: personFieldsSchema().optional(),
      },
    },
    async ({ resource_name, copy_mask, read_mask }) => {
      try {
        return ok(await client.copyOtherContact({ resourceName: resource_name, copyMask: copy_mask, readMask: read_mask }));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
