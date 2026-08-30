import { test } from "node:test";
import assert from "node:assert/strict";
import { registerContactTools } from "./contacts.js";
import { registerGroupTools } from "./groups.js";
import { registerBatchTools } from "./batch.js";
import { registerOtherContactTools } from "./other.js";
import { registerRawTool } from "./raw.js";
import { DESTRUCTIVE, READ_ONLY, UPDATE, WRITE } from "./util.js";

interface Annotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/** Registers every tool against a fake server, capturing each tool's annotations. */
function collectAnnotations(): Record<string, Annotations | undefined> {
  const annotations: Record<string, Annotations | undefined> = {};
  const server = {
    registerTool: (name: string, cfg: { annotations?: Annotations }) => {
      annotations[name] = cfg.annotations;
    },
  };
  // Registration reads the client only inside handlers, so a stub is fine here.
  registerContactTools(server as never, {} as never);
  registerGroupTools(server as never, {} as never);
  registerBatchTools(server as never, {} as never);
  registerOtherContactTools(server as never, {} as never);
  registerRawTool(server as never, {} as never);
  return annotations;
}

const ANN = collectAnnotations();

/**
 * The People API mixes reads and writes, so instead of one blanket invariant
 * the expected hints are pinned per tool. Changing a tool's annotation must be
 * a conscious decision that updates this map.
 */
const EXPECTED: Record<string, Annotations> = {
  list_contacts: READ_ONLY,
  search_contacts: READ_ONLY,
  get_contact: READ_ONLY,
  batch_get_contacts: READ_ONLY,
  create_contact: WRITE,
  update_contact: UPDATE,
  delete_contact: DESTRUCTIVE,
  list_contact_groups: READ_ONLY,
  get_contact_group: READ_ONLY,
  create_contact_group: WRITE,
  update_contact_group: UPDATE,
  delete_contact_group: DESTRUCTIVE,
  modify_group_members: UPDATE,
  batch_create_contacts: WRITE,
  batch_update_contacts: UPDATE,
  batch_delete_contacts: DESTRUCTIVE,
  list_other_contacts: READ_ONLY,
  copy_other_contact: WRITE,
  raw_request: DESTRUCTIVE,
};

test("registers all nineteen tools with annotations", () => {
  assert.deepEqual(Object.keys(ANN).sort(), Object.keys(EXPECTED).sort());
  for (const [name, a] of Object.entries(ANN)) {
    assert.ok(a, `${name} is missing annotations`);
  }
});

test("every tool carries exactly its pinned hints (all four set)", () => {
  for (const [name, expected] of Object.entries(EXPECTED)) {
    assert.deepEqual(ANN[name], expected, `${name} annotations drifted`);
  }
});

test("deletes are destructive — nothing that removes people or groups may look safe", () => {
  for (const name of ["delete_contact", "delete_contact_group", "batch_delete_contacts"]) {
    assert.equal(ANN[name]?.destructiveHint, true, `${name} must be destructive`);
    assert.equal(ANN[name]?.readOnlyHint, false, `${name} must not be read-only`);
  }
});

test("other-contact reads stay read-only — the API cannot edit them in place", () => {
  assert.equal(ANN.list_other_contacts?.readOnlyHint, true);
});
