import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleContactsClient, HttpMethod } from "../client.js";
import { DESTRUCTIVE, fail, ok } from "./util.js";

export function registerRawTool(server: McpServer, client: GoogleContactsClient): void {
  server.registerTool(
    "raw_request",
    {
      title: "Raw Google People API call",
      // Full API surface incl. updateContactPhoto and batch deletes — annotate
      // for the worst case a call can do, not the average.
      annotations: DESTRUCTIVE,
      description:
        'Escape hatch to call any Google People API v1 path directly, for requests the typed tools don\'t cover — e.g. contact photos (PATCH "v1/people/<id>:updateContactPhoto" with {"photoBytes":"<base64>"} or DELETE "v1/people/<id>:deleteContactPhoto"), "Other contacts" (GET "v1/otherContacts?readMask=..." — needs the contacts.other.readonly scope on the token), or extra query parameters like sources. The path may carry a query string; repeated parameters are written inline ("v1/people:batchGet?resourceNames=people/a&resourceNames=people/b&personFields=names"). The Bearer token is added automatically; the method defaults to GET. Writes are never retried after ambiguous failures.',
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe('API path relative to https://people.googleapis.com, e.g. "v1/people/c123?personFields=names".'),
        method: z
          .enum(["GET", "POST", "PUT", "PATCH", "DELETE"])
          .optional()
          .describe("HTTP method. Defaults to GET."),
        body: z.record(z.any()).optional().describe("JSON request body (POST/PUT/PATCH only)."),
      },
    },
    async ({ path, method, body }) => {
      try {
        const m = (method ?? "GET") as HttpMethod;
        return ok(await client.request(m, path, body));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
