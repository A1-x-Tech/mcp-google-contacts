import { test } from "node:test";
import assert from "node:assert/strict";
import { registerContactTools } from "./contacts.js";

type Args = Record<string, unknown>;
type Handler = (args: Args) => Promise<{ content: { text: string }[]; isError?: boolean }>;

/** Fake server + fake client so the tool handlers run without network. */
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
    listContacts: make("listContacts"),
    searchContacts: make("searchContacts"),
    getContact: make("getContact"),
    batchGetContacts: make("batchGetContacts"),
    createContact: make("createContact"),
    updateContact: make("updateContact"),
    deleteContact: make("deleteContact"),
  };
  const tools: Record<string, Handler> = {};
  const server = {
    registerTool: (name: string, _cfg: unknown, handler: Handler) => {
      tools[name] = handler;
    },
  };
  registerContactTools(server as never, client as never);
  return { calls, tools };
}

test("registers the seven contact tools", () => {
  const { tools } = harness();
  assert.deepEqual(Object.keys(tools).sort(), [
    "batch_get_contacts",
    "create_contact",
    "delete_contact",
    "get_contact",
    "list_contacts",
    "search_contacts",
    "update_contact",
  ]);
});

test("list_contacts forwards pagination, sort and sync params normalized", async () => {
  const { calls, tools } = harness();
  await tools.list_contacts({
    person_fields: ["names", "metadata"],
    page_size: 500,
    page_token: "tok",
    sort_order: "LAST_NAME_ASCENDING",
    request_sync_token: true,
    sync_token: "sync",
  });
  assert.equal(calls[0].method, "listContacts");
  assert.deepEqual(calls[0].params[0], {
    personFields: ["names", "metadata"],
    pageSize: 500,
    pageToken: "tok",
    sortOrder: "LAST_NAME_ASCENDING",
    requestSyncToken: true,
    syncToken: "sync",
  });
});

test("search_contacts forwards query, mask and page size", async () => {
  const { calls, tools } = harness();
  await tools.search_contacts({ query: "ada", read_mask: ["names"], page_size: 5 });
  assert.equal(calls[0].method, "searchContacts");
  assert.deepEqual(calls[0].params[0], { query: "ada", readMask: ["names"], pageSize: 5 });
});

test("get_contact and batch_get_contacts pass resource names + mask through", async () => {
  const { calls, tools } = harness();
  await tools.get_contact({ resource_name: "people/c1", person_fields: ["names", "photos"] });
  assert.deepEqual(calls[0], { method: "getContact", params: ["people/c1", ["names", "photos"]] });

  await tools.batch_get_contacts({ resource_names: ["people/c1", "people/c2"], person_fields: ["names"] });
  assert.deepEqual(calls[1], { method: "batchGetContacts", params: [["people/c1", "people/c2"], ["names"]] });
});

test("create_contact normalizes snake_case fields into ContactFields", async () => {
  const { calls, tools } = harness();
  await tools.create_contact({
    given_name: "Ada",
    family_name: "Lovelace",
    emails: [{ value: "a@b.c", type: "work" }],
    addresses: [{ street: "1 Main St", postal_code: "E1" }],
    organization: { name: "Engines", title: "Engineer" },
    birthday: "1815-12-10",
    person_fields: ["names"],
  });
  assert.equal(calls[0].method, "createContact");
  const fields = calls[0].params[0] as Record<string, unknown>;
  assert.equal(fields.givenName, "Ada");
  assert.equal(fields.familyName, "Lovelace");
  assert.deepEqual(fields.emails, [{ value: "a@b.c", type: "work" }]);
  assert.deepEqual(fields.addresses, [
    { street: "1 Main St", city: undefined, region: undefined, postalCode: "E1", country: undefined, type: undefined },
  ]);
  assert.deepEqual(fields.organization, { name: "Engines", title: "Engineer" });
  assert.equal(fields.birthday, "1815-12-10");
  assert.deepEqual(calls[0].params[1], ["names"]);
});

test("update_contact forwards resource name, etag and normalized fields", async () => {
  const { calls, tools } = harness();
  await tools.update_contact({
    resource_name: "people/c1",
    etag: "E1",
    phones: [{ value: "+1" }],
    emails: [],
  });
  assert.equal(calls[0].method, "updateContact");
  const p = calls[0].params[0] as { resourceName: string; etag?: string; fields: Record<string, unknown> };
  assert.equal(p.resourceName, "people/c1");
  assert.equal(p.etag, "E1");
  assert.deepEqual(p.fields.phones, [{ value: "+1" }]);
  assert.deepEqual(p.fields.emails, [], "an explicit empty list (a clear) must survive normalization");
});

test("delete_contact passes the resource name through", async () => {
  const { calls, tools } = harness();
  await tools.delete_contact({ resource_name: "people/c9" });
  assert.deepEqual(calls[0], { method: "deleteContact", params: ["people/c9"] });
});

test("a client error is returned as an isError result, not thrown", async () => {
  const { tools } = harness({ throwOn: "createContact" });
  const res = await tools.create_contact({ given_name: "Ada" });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /boom/);
});
