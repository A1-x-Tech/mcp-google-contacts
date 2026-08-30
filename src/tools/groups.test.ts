import { test } from "node:test";
import assert from "node:assert/strict";
import { registerGroupTools } from "./groups.js";

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
    listContactGroups: make("listContactGroups"),
    getContactGroup: make("getContactGroup"),
    createContactGroup: make("createContactGroup"),
    updateContactGroup: make("updateContactGroup"),
    deleteContactGroup: make("deleteContactGroup"),
    modifyGroupMembers: make("modifyGroupMembers"),
  };
  const tools: Record<string, Handler> = {};
  const server = {
    registerTool: (name: string, _cfg: unknown, handler: Handler) => {
      tools[name] = handler;
    },
  };
  registerGroupTools(server as never, client as never);
  return { calls, tools };
}

test("registers the six group tools", () => {
  const { tools } = harness();
  assert.deepEqual(Object.keys(tools).sort(), [
    "create_contact_group",
    "delete_contact_group",
    "get_contact_group",
    "list_contact_groups",
    "modify_group_members",
    "update_contact_group",
  ]);
});

test("list and get forward normalized params", async () => {
  const { calls, tools } = harness();
  await tools.list_contact_groups({ page_size: 100, page_token: "t", group_fields: ["name", "memberCount"] });
  assert.deepEqual(calls[0].params[0], {
    pageSize: 100,
    pageToken: "t",
    groupFields: ["name", "memberCount"],
    syncToken: undefined,
  });

  await tools.get_contact_group({ resource_name: "contactGroups/g1", max_members: 50 });
  assert.deepEqual(calls[1].params, ["contactGroups/g1", { maxMembers: 50, groupFields: undefined }]);
});

test("create, update and delete forward their params", async () => {
  const { calls, tools } = harness();
  await tools.create_contact_group({ name: "Friends" });
  assert.deepEqual(calls[0], { method: "createContactGroup", params: ["Friends"] });

  await tools.update_contact_group({ resource_name: "contactGroups/g1", name: "Close friends", etag: "E" });
  assert.deepEqual(calls[1].params[0], { resourceName: "contactGroups/g1", name: "Close friends", etag: "E" });

  await tools.delete_contact_group({ resource_name: "contactGroups/g1", delete_contacts: true });
  assert.deepEqual(calls[2], { method: "deleteContactGroup", params: ["contactGroups/g1", true] });
});

test("modify_group_members requires at least one of add/remove", async () => {
  const { calls, tools } = harness();
  const res = await tools.modify_group_members({ resource_name: "contactGroups/g1" });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /at least one of add or remove/i);
  assert.equal(calls.length, 0, "validation failures must not reach the API");

  await tools.modify_group_members({
    resource_name: "contactGroups/g1",
    add: ["people/c1"],
    remove: ["people/c2"],
  });
  assert.deepEqual(calls[0].params[0], {
    resourceName: "contactGroups/g1",
    add: ["people/c1"],
    remove: ["people/c2"],
  });
});

test("a client error is returned as an isError result, not thrown", async () => {
  const { tools } = harness({ throwOn: "deleteContactGroup" });
  const res = await tools.delete_contact_group({ resource_name: "contactGroups/g1" });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /boom/);
});
