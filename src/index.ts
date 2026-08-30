#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GoogleContactsClient } from "./client.js";
import { ConfigError, DEFAULT_BASE, hasCredentials, loadConfig } from "./config.js";
import { instrumentToolCalls, Telemetry } from "./telemetry.js";
import type { GoogleContactsConfig } from "./types.js";
import { registerContactTools } from "./tools/contacts.js";
import { registerGroupTools } from "./tools/groups.js";
import { registerBatchTools } from "./tools/batch.js";
import { registerOtherContactTools } from "./tools/other.js";
import { registerRawTool } from "./tools/raw.js";

/**
 * Prose handed to the calling model in the `initialize` result — the only place
 * it learns what the tool list cannot say: which Google product this API is,
 * what the API refuses to do, and the behaviours that make a naive loop
 * expensive, lossy or duplicating.
 */
const INSTRUCTIONS =
  "Google People API v1 manages the signed-in account's personal Google Contacts — not the Workspace " +
  "directory and not other users' address books; Gmail's auto-saved \"Other contacts\" live outside the " +
  "saved list and have their own tools (list_other_contacts, copy_other_contact) plus their own OAuth " +
  "scope. Every read takes an explicit person_fields/read_mask; an omitted mask gets the compact default " +
  "(names, emailAddresses, phoneNumbers, organizations, memberships), and absent fields in a response " +
  "mean 'not requested or empty', not lost data. " +
  "Writes are etag-guarded: update_contact and batch_update_contacts auto-fetch the current etag when you " +
  "omit it, and a stale etag fails with 400 — re-read, then retry deliberately. Updates REPLACE each " +
  "provided field as a whole (all emails, the whole name): read the contact first and send complete values, " +
  "or you will silently drop data. search_contacts indexes writes with a lag of seconds to minutes and " +
  "caps page_size at 30 — a just-created contact is found by list_contacts/get_contact but not yet by " +
  "search. There is no duplicate detection: a repeated create makes a second contact, so after a timeout " +
  "or 5xx on any write (they are never auto-retried) check what committed via list/get before re-sending. " +
  "delete_contact and batch_delete_contacts are permanent — this API has no trash. Contact groups: only " +
  "USER_CONTACT_GROUP labels can be renamed/deleted; system groups (myContacts, starred) are fixed, and " +
  "modify_group_members' HTTP 200 still carries per-contact failures (notFoundResourceNames) — read the " +
  "body. Per-user per-minute quotas are tight (~90 requests/min class): prefer batch_get_contacts and " +
  "sync tokens (request_sync_token/sync_token in list_contacts; HTTP 410 means the token expired — do a " +
  "full re-list) over polling loops. Auth that suddenly breaks usually means the OAuth consent screen is " +
  "still in Testing, where refresh tokens die after 7 days.";

/**
 * Prepended to INSTRUCTIONS when no credentials are configured. The model reads
 * this before it picks a tool, so an unconfigured session opens with the fix
 * rather than with a failed call. There is no in-chat login here: credentials
 * come only from the environment, so the fix is an operator action + restart.
 */
const UNCONFIGURED_PREFIX =
  "ATTENTION: Google Contacts is not connected yet — no credentials are configured, so every " +
  "tool call will fail. The operator must set GOOGLE_CONTACTS_CLIENT_ID + " +
  "GOOGLE_CONTACTS_CLIENT_SECRET + GOOGLE_CONTACTS_REFRESH_TOKEN (recommended), or " +
  "GOOGLE_CONTACTS_ACCESS_TOKEN with a short-lived access token, in the MCP client's " +
  "server config and restart this server — the variables are read only at startup. ";

/** Reads the package version so the server reports its real version to MCP clients. */
function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Loads the config without dying on a bad value. A server that exits here never
 * completes the MCP handshake, so the user sees a dead server and no reason.
 * Instead the problem is carried into the session, where the model can read it
 * and relay it: the config degrades to "no credentials" and every tool call
 * fails with the actionable message.
 */
function loadConfigOrDegraded(telemetry: Telemetry): {
  config: GoogleContactsConfig;
  problem?: ConfigError;
} {
  try {
    return { config: loadConfig() };
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    console.error(`Error: ${err.message}`);
    // Fire-and-forget now that the process survives: the historical
    // `startup_failed` funnel stays comparable, but nothing blocks startup.
    telemetry.send("startup_failed", { reason: err.reason });
    return {
      config: { apiBase: process.env.GOOGLE_CONTACTS_API_BASE || DEFAULT_BASE },
      problem: err,
    };
  }
}

async function main(): Promise<void> {
  // Anonymous usage pings (ids/names/versions only, never data or arguments);
  // opt out with ASKADS_TELEMETRY=0. Built before the config so missing
  // credentials can be reported; wired to the server before tools register.
  const telemetry = new Telemetry(readVersion());
  const { config, problem } = loadConfigOrDegraded(telemetry);
  const client = new GoogleContactsClient(config);

  // Decided once, at startup: credentials come only from the environment, so
  // "restart after setting the variables" is the accurate advice to give.
  const connected = hasCredentials(config);

  const server = new McpServer(
    {
      name: "mcp-google-contacts",
      version: readVersion(),
    },
    // Surfaces in the initialize result, before the client sees a single tool.
    {
      instructions: connected
        ? INSTRUCTIONS
        : UNCONFIGURED_PREFIX + (problem ? `Configuration problem: ${problem.message} ` : "") + INSTRUCTIONS,
    },
  );

  instrumentToolCalls(server, telemetry);
  server.server.oninitialized = () => {
    telemetry.setClientInfo(server.server.getClientVersion());
    // Split on purpose: `server_start` keeps meaning "a usable install started",
    // so the unconfigured case gets its own event instead of inflating that number.
    if (connected) telemetry.send("server_start");
    else telemetry.send("unconfigured_start", { reason: problem?.reason ?? "missing_credentials" });
  };

  registerContactTools(server, client);
  registerGroupTools(server, client);
  registerBatchTools(server, client);
  registerOtherContactTools(server, client);
  registerRawTool(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `mcp-google-contacts running on stdio${connected ? "" : " (no credentials — set the environment variables and restart)"}`,
  );
}

main().catch((err) => {
  console.error("Fatal error starting mcp-google-contacts:", err);
  process.exit(1);
});
