import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { GoogleContactsClient } from "../dist/client.js";
import { registerContactTools } from "../dist/tools/contacts.js";
import { registerGroupTools } from "../dist/tools/groups.js";
import { registerBatchTools } from "../dist/tools/batch.js";
import { registerOtherContactTools } from "../dist/tools/other.js";
import { registerRawTool } from "../dist/tools/raw.js";

const ALL_TOOLS = [
  "batch_create_contacts",
  "batch_delete_contacts",
  "batch_get_contacts",
  "batch_update_contacts",
  "copy_other_contact",
  "create_contact",
  "create_contact_group",
  "delete_contact",
  "delete_contact_group",
  "get_contact",
  "get_contact_group",
  "list_contact_groups",
  "list_contacts",
  "list_other_contacts",
  "modify_group_members",
  "raw_request",
  "search_contacts",
  "update_contact",
  "update_contact_group",
];

test("dist client rejects foreign-origin paths before sending the Bearer token", async () => {
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response("{}", { status: 200 });
  };
  try {
    const client = new GoogleContactsClient({
      accessToken: "SECRET",
      apiBase: "https://people.googleapis.com",
      timeoutMs: 1000,
      maxRetries: 0,
    });
    await assert.rejects(() => client.request("GET", "https://example.invalid/steal"), /foreign origin/);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = original;
  }
});

test("dist client sends the Bearer token and JSON bodies", async () => {
  const original = globalThis.fetch;
  let seen;
  globalThis.fetch = async (url, init) => {
    seen = { url: String(url), auth: init.headers.Authorization, body: JSON.parse(init.body) };
    return new Response('{"resourceName":"people/c1"}', { status: 200 });
  };
  try {
    const client = new GoogleContactsClient({
      accessToken: "SECRET",
      apiBase: "https://people.googleapis.com",
      timeoutMs: 1000,
      maxRetries: 0,
    });
    await client.createContact({ givenName: "Smoke" });
    const url = new URL(seen.url);
    assert.equal(url.origin + url.pathname, "https://people.googleapis.com/v1/people:createContact");
    assert.equal(seen.auth, "Bearer SECRET");
    assert.deepEqual(seen.body, { names: [{ givenName: "Smoke" }] });
  } finally {
    globalThis.fetch = original;
  }
});

test("dist registers the expected tools", () => {
  const names = [];
  const server = {
    registerTool(name) {
      names.push(name);
    },
  };
  const client = {};

  registerContactTools(server, client);
  registerGroupTools(server, client);
  registerBatchTools(server, client);
  registerOtherContactTools(server, client);
  registerRawTool(server, client);

  assert.deepEqual(names.sort(), ALL_TOOLS);
});

test("dist binary completes a real MCP handshake over stdio and lists every tool", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../dist/index.js", import.meta.url))],
    env: {
      ...process.env,
      GOOGLE_CONTACTS_ACCESS_TOKEN: "test-token",
      ASKADS_TELEMETRY: "0", // keep the suite offline
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "dist-smoke", version: "0.0.0" });
  await client.connect(transport);
  try {
    const server = client.getServerVersion();
    assert.equal(server?.name, "mcp-google-contacts");
    assert.match(String(server?.version), /^\d+\.\d+\.\d+$/);

    // The instructions the calling model reads before it picks any tool.
    const instructions = client.getInstructions();
    assert.equal(typeof instructions, "string");
    assert.ok(instructions.trim().length > 0, "initialize result carries no instructions");
    assert.match(instructions, /Google People API v1/);

    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ALL_TOOLS);

    const getContact = tools.find((t) => t.name === "get_contact");
    assert.equal(getContact.annotations?.readOnlyHint, true);
    assert.ok(getContact.inputSchema?.properties?.resource_name, "input schema must reach the client");
  } finally {
    await client.close();
  }
});

/**
 * The degraded-start contract: without any credentials the binary must not
 * exit(1) before the handshake, leaving the client a dead server and no reason.
 * It must start, list every tool, open the instructions with the fix, and
 * answer a tool call with the actionable error — offline: the CredentialsError
 * fires before any fetch, so this test never touches the network.
 */
test("dist binary starts without credentials: handshake, tool list, actionable call error", async () => {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) => value !== undefined && !key.startsWith("GOOGLE_CONTACTS_"),
    ),
  );
  env.ASKADS_TELEMETRY = "0"; // keep the suite offline
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../dist/index.js", import.meta.url))],
    env,
    stderr: "pipe",
  });
  const client = new Client({ name: "dist-smoke-unconfigured", version: "0.0.0" });
  await client.connect(transport);
  try {
    // The model must read the fix before it picks a tool.
    const instructions = client.getInstructions() ?? "";
    assert.match(instructions, /not connected/);
    assert.match(instructions, /GOOGLE_CONTACTS_CLIENT_ID/);
    assert.match(instructions, /restart/);

    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ALL_TOOLS);

    // A tool call fails with the exact message instead of killing the server.
    const result = await client.callTool({ name: "get_contact", arguments: { resource_name: "people/me" } });
    assert.equal(result.isError, true);
    const text = result.content.map((c) => c.text ?? "").join(" ");
    assert.match(text, /Google OAuth credentials are required: set GOOGLE_CONTACTS_CLIENT_ID/);
    assert.match(text, /restart the server/);
  } finally {
    await client.close();
  }
});
