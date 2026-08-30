import { test } from "node:test";
import assert from "node:assert/strict";
import { registerBatchTools } from "./batch.js";

type Args = Record<string, unknown>;
type Handler = (args: Args) => Promise<{ content: { text: string }[]; isError?: boolean }>;

function harness(opts: { throwOn?: string } = {}) {
  const calls: { method: string; params: unknown[] }[] = [];
  const make =
    (method: string) =>
    async (...params: unknown[]) => {
      calls.push({ method, params });
      if (opts.throwOn === method) throw new Error("boom");
      return { ok: true };
    };
  const client = {
    batchCreateContacts: make("batchCreateContacts"),
    batchUpdateContacts: make("batchUpdateContacts"),
    batchDeleteContacts: make("batchDeleteContacts"),
  };
  const tools: Record<string, Handler> = {};
  const server = {
    registerTool: (name: string, _cfg: unknown, handler: Handler) => {
      tools[name] = handler;
    },
  };
  registerBatchTools(server as never, client as never);
  return { calls, tools };
}

test("registers the three batch tools", () => {
  const { tools } = harness();
  assert.deepEqual(Object.keys(tools).sort(), [
    "batch_create_contacts",
    "batch_delete_contacts",
    "batch_update_contacts",
  ]);
});

test("batch_create_contacts normalizes every entry", async () => {
  const { calls, tools } = harness();
  await tools.batch_create_contacts({
    contacts: [
      { given_name: "A", emails: [{ value: "a@x.y" }] },
      { family_name: "B", organization: { name: "Org" } },
    ],
    read_mask: ["names"],
  });
  assert.equal(calls[0].method, "batchCreateContacts");
  const entries = calls[0].params[0] as Record<string, unknown>[];
  assert.equal(entries[0].givenName, "A");
  assert.deepEqual(entries[0].emails, [{ value: "a@x.y" }]);
  assert.equal(entries[1].familyName, "B");
  assert.deepEqual(entries[1].organization, { name: "Org" });
  assert.deepEqual(calls[0].params[1], ["names"]);
});

test("batch_update_contacts maps each entry to {resourceName, etag, fields}", async () => {
  const { calls, tools } = harness();
  await tools.batch_update_contacts({
    updates: [
      { resource_name: "people/c1", etag: "E1", given_name: "A" },
      { resource_name: "people/c2", phones: [{ value: "+2" }] },
    ],
  });
  const updates = calls[0].params[0] as { resourceName: string; etag?: string; fields: Record<string, unknown> }[];
  assert.equal(updates[0].resourceName, "people/c1");
  assert.equal(updates[0].etag, "E1");
  assert.equal(updates[0].fields.givenName, "A");
  assert.equal(updates[1].resourceName, "people/c2");
  assert.equal(updates[1].etag, undefined);
  assert.deepEqual(updates[1].fields.phones, [{ value: "+2" }]);
});

test("batch_delete_contacts passes the resource names through", async () => {
  const { calls, tools } = harness();
  await tools.batch_delete_contacts({ resource_names: ["people/c1", "people/c2"] });
  assert.deepEqual(calls[0], { method: "batchDeleteContacts", params: [["people/c1", "people/c2"]] });
});

test("a client error is returned as an isError result, not thrown", async () => {
  const { tools } = harness({ throwOn: "batchDeleteContacts" });
  const res = await tools.batch_delete_contacts({ resource_names: ["people/c1"] });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /boom/);
});
