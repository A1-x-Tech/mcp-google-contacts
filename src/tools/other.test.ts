import { test } from "node:test";
import assert from "node:assert/strict";
import { registerOtherContactTools } from "./other.js";

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
    listOtherContacts: make("listOtherContacts"),
    searchOtherContacts: make("searchOtherContacts"),
    copyOtherContact: make("copyOtherContact"),
  };
  const tools: Record<string, Handler> = {};
  const server = {
    registerTool: (name: string, _cfg: unknown, handler: Handler) => {
      tools[name] = handler;
    },
  };
  registerOtherContactTools(server as never, client as never);
  return { calls, tools };
}

test("registers the two other-contact tools", () => {
  const { tools } = harness();
  assert.deepEqual(Object.keys(tools).sort(), ["copy_other_contact", "list_other_contacts"]);
});

test("without query the tool lists; with query it searches", async () => {
  const { calls, tools } = harness();
  await tools.list_other_contacts({ read_mask: ["names"], page_size: 100, page_token: "t" });
  assert.equal(calls[0].method, "listOtherContacts");
  assert.deepEqual(calls[0].params[0], {
    readMask: ["names"],
    pageSize: 100,
    pageToken: "t",
    requestSyncToken: undefined,
    syncToken: undefined,
  });

  await tools.list_other_contacts({ query: "bob", page_size: 10 });
  assert.equal(calls[1].method, "searchOtherContacts");
  assert.deepEqual(calls[1].params[0], { query: "bob", readMask: undefined, pageSize: 10 });
});

test("query rejects list-only parameters instead of silently dropping them", async () => {
  const { calls, tools } = harness();
  const withToken = await tools.list_other_contacts({ query: "bob", page_token: "t" });
  assert.equal(withToken.isError, true);
  assert.match(withToken.content[0].text, /cannot be combined/);

  const withSync = await tools.list_other_contacts({ query: "bob", sync_token: "s" });
  assert.equal(withSync.isError, true);

  const tooBig = await tools.list_other_contacts({ query: "bob", page_size: 31 });
  assert.equal(tooBig.isError, true);
  assert.match(tooBig.content[0].text, /30 or less/);

  assert.equal(calls.length, 0, "invalid combinations must not reach the API");
});

test("copy_other_contact forwards masks normalized", async () => {
  const { calls, tools } = harness();
  await tools.copy_other_contact({
    resource_name: "otherContacts/o1",
    copy_mask: ["names", "emailAddresses"],
    read_mask: ["names"],
  });
  assert.deepEqual(calls[0].params[0], {
    resourceName: "otherContacts/o1",
    copyMask: ["names", "emailAddresses"],
    readMask: ["names"],
  });
});

test("a client error is returned as an isError result, not thrown", async () => {
  const { tools } = harness({ throwOn: "copyOtherContact" });
  const res = await tools.copy_other_contact({ resource_name: "otherContacts/o1" });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /boom/);
});
