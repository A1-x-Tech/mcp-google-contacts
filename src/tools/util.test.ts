import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contactFieldsShape,
  DESTRUCTIVE,
  fail,
  groupResourceNameSchema,
  ok,
  personFieldsSchema,
  personResourceNameSchema,
  READ_ONLY,
  toContactFields,
  UPDATE,
  WRITE,
} from "./util.js";

test("personResourceNameSchema accepts full resource names and rejects everything else", () => {
  const s = personResourceNameSchema(); // factory → fresh schema
  assert.equal(s.safeParse("people/c1234567890").success, true);
  assert.equal(s.safeParse("people/me").success, true);
  assert.equal(s.safeParse("c1234567890").success, false, "a bare id is ambiguous");
  assert.equal(s.safeParse("contactGroups/abc").success, false);
  assert.equal(s.safeParse("people/a/b").success, false);
});

test("groupResourceNameSchema requires the contactGroups/ prefix", () => {
  const s = groupResourceNameSchema();
  assert.equal(s.safeParse("contactGroups/myContacts").success, true);
  assert.equal(s.safeParse("people/c1").success, false);
});

test("personFieldsSchema accepts only real person fields", () => {
  const s = personFieldsSchema();
  assert.equal(s.safeParse(["names", "emailAddresses"]).success, true);
  assert.equal(s.safeParse(["names", "notAField"]).success, false);
  assert.equal(s.safeParse([]).success, false, "an empty mask would make the API reject the call");
});

test("schema factories return independent schemas (no $ref dedup)", () => {
  assert.notEqual(personResourceNameSchema(), personResourceNameSchema());
  assert.notEqual(personFieldsSchema(), personFieldsSchema());
});

test("toContactFields renames snake_case keys and keeps empty arrays (clears)", () => {
  const fields = toContactFields({
    given_name: "Ada",
    addresses: [{ street: "1 Main", postal_code: "E1" }],
    emails: [],
  });
  assert.equal(fields.givenName, "Ada");
  assert.equal(fields.addresses?.[0]?.postalCode, "E1");
  assert.deepEqual(fields.emails, []);
  assert.equal(fields.phones, undefined, "absent keys must stay absent, not become empty");
});

test('the birthday input accepts both date forms and "" (the clear signal)', () => {
  const s = contactFieldsShape().birthday;
  assert.equal(s.safeParse("1815-12-10").success, true);
  assert.equal(s.safeParse("12-10").success, true);
  assert.equal(s.safeParse("").success, true, '"" must pass — it is how an update clears the birthday');
  assert.equal(s.safeParse("yesterday").success, false);
});

test("ok emits compact JSON; fail flags isError", () => {
  assert.equal((ok({ a: 1 }).content[0] as { text: string }).text, '{"a":1}');
  const f = fail(new Error("boom"));
  assert.equal(f.isError, true);
  assert.match((f.content[0] as { text: string }).text, /boom/);
});

test("fail appends the underlying cause when present", () => {
  const err = new Error("timeout", { cause: new Error("ECONNRESET") });
  const f = fail(err);
  assert.match((f.content[0] as { text: string }).text, /timeout \(ECONNRESET\)/);
});

test("the four annotation presets set all four hints explicitly", () => {
  assert.deepEqual(READ_ONLY, {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  });
  assert.deepEqual(WRITE, {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  });
  assert.deepEqual(UPDATE, {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  });
  assert.deepEqual(DESTRUCTIVE, {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  });
});
