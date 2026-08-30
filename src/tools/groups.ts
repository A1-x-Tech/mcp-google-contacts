import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleContactsClient } from "../client.js";
import {
  DESTRUCTIVE,
  fail,
  groupFieldsSchema,
  groupResourceNameSchema,
  ok,
  personResourceNameSchema,
  READ_ONLY,
  UPDATE,
  WRITE,
} from "./util.js";

export function registerGroupTools(server: McpServer, client: GoogleContactsClient): void {
  server.registerTool(
    "list_contact_groups",
    {
      title: "List contact groups",
      annotations: READ_ONLY,
      description:
        "Lists the account's contact groups (labels): contactGroups[] with resourceName (contactGroups/<id>), name, groupType and memberCount, plus nextPageToken and totalItems. Two kinds come back: USER_CONTACT_GROUP (labels the user created — the only kind that can be renamed or deleted) and SYSTEM_CONTACT_GROUP (built-ins like contactGroups/myContacts and contactGroups/starred — fixed). group_fields defaults to metadata, groupType, memberCount, name; add memberCount explicitly if you narrow it and still want sizes. page_size up to 1000; sync_token works like in list_contacts (410 = expired, re-list in full).",
      inputSchema: {
        page_size: z.number().int().min(1).max(1000).optional().describe("Groups per page (1..1000, default 30)."),
        page_token: z.string().optional().describe("nextPageToken from the previous page."),
        group_fields: groupFieldsSchema().optional(),
        sync_token: z.string().optional().describe("Sync token from a previous listing — only changes since then."),
      },
    },
    async ({ page_size, page_token, group_fields, sync_token }) => {
      try {
        return ok(
          await client.listContactGroups({
            pageSize: page_size,
            pageToken: page_token,
            groupFields: group_fields,
            syncToken: sync_token,
          }),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "get_contact_group",
    {
      title: "Get a contact group",
      annotations: READ_ONLY,
      description:
        "Fetches one contact group by resource name: name, groupType, memberCount and etag — plus, when max_members > 0, memberResourceNames[] with up to that many member contacts as people/<id> resource names (the only way the API returns a group's members; feed them to batch_get_contacts for details). The etag is what update_contact_group uses to rename safely.",
      inputSchema: {
        resource_name: groupResourceNameSchema(),
        max_members: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("How many member resource names to include (0 or omitted = none, just the group)."),
        group_fields: groupFieldsSchema().optional(),
      },
    },
    async ({ resource_name, max_members, group_fields }) => {
      try {
        return ok(
          await client.getContactGroup(resource_name, { maxMembers: max_members, groupFields: group_fields }),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "create_contact_group",
    {
      title: "Create a contact group",
      annotations: WRITE,
      description:
        "Creates a new user contact group (label) and returns it (resourceName contactGroups/<id>, name, etag). Group names must be unique — creating a duplicate name fails with 409 CONFLICT rather than making a second group. Put contacts into the new group with modify_group_members.",
      inputSchema: {
        name: z.string().min(1).describe("The group's display name (must be unique among the user's groups)."),
      },
    },
    async ({ name }) => {
      try {
        return ok(await client.createContactGroup(name));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "update_contact_group",
    {
      title: "Rename a contact group",
      annotations: UPDATE,
      description:
        "Renames a user contact group (the only mutable group attribute). Etag-guarded like contact updates: pass etag from get_contact_group to fail cleanly on a concurrent edit, or omit it and the current etag is fetched automatically (one extra read). System groups (contactGroups/myContacts, starred, ...) cannot be renamed; the new name must stay unique (409 CONFLICT otherwise). Returns the updated group.",
      inputSchema: {
        resource_name: groupResourceNameSchema(),
        name: z.string().min(1).describe("The new display name."),
        etag: z
          .string()
          .optional()
          .describe("The group's etag from get_contact_group — omit to auto-fetch the current one."),
      },
    },
    async ({ resource_name, name, etag }) => {
      try {
        return ok(await client.updateContactGroup({ resourceName: resource_name, name, etag }));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "delete_contact_group",
    {
      title: "Delete a contact group",
      annotations: DESTRUCTIVE,
      description:
        "Permanently deletes a user contact group (label). By default the member contacts SURVIVE — they only lose the label; delete_contacts=true also PERMANENTLY DELETES every contact in the group, so use it only when that is explicitly wanted (check the roster first via get_contact_group with max_members). System groups cannot be deleted. Returns an empty result on success; there is no undo through this API.",
      inputSchema: {
        resource_name: groupResourceNameSchema(),
        delete_contacts: z
          .boolean()
          .optional()
          .describe("Also permanently delete every member contact (default false — contacts just lose the label)."),
      },
    },
    async ({ resource_name, delete_contacts }) => {
      try {
        return ok(await client.deleteContactGroup(resource_name, delete_contacts));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "modify_group_members",
    {
      title: "Add or remove group members",
      annotations: UPDATE,
      description:
        "Adds and/or removes contacts in a contact group (label) in one call — at least one of add/remove is required, together up to ~1000 names. Contacts are addressed by their people/<id> resource names. The HTTP 200 response is NOT a full success receipt — read it: notFoundResourceNames lists contacts that do not exist (their changes were skipped) and canNotRemoveLastContactGroupResourceNames lists contacts that could not leave their last group. Removing a contact from a group never deletes the contact, and re-running the same call converges. Contacts cannot be removed from contactGroups/myContacts this way.",
      inputSchema: {
        resource_name: groupResourceNameSchema(),
        add: z.array(personResourceNameSchema()).optional().describe("Contacts to add to the group."),
        remove: z.array(personResourceNameSchema()).optional().describe("Contacts to remove from the group."),
      },
    },
    async ({ resource_name, add, remove }) => {
      try {
        if ((!add || add.length === 0) && (!remove || remove.length === 0)) {
          return fail(new Error("At least one of add or remove (non-empty) is required."));
        }
        return ok(await client.modifyGroupMembers({ resourceName: resource_name, add, remove }));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
