import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPerson, DEFAULT_PERSON_FIELDS, GoogleContactsClient } from "./client.js";
import { CredentialsError, MISSING_CREDENTIALS_MESSAGE } from "./config.js";
import type { GoogleContactsConfig } from "./types.js";

const BASE = "https://people.googleapis.com";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

type Call = { url: string; method: string; auth: unknown; body: string | undefined };

/** A client on a static access token — no token-endpoint traffic expected. */
function staticConfig(extra: Partial<GoogleContactsConfig> = {}): GoogleContactsConfig {
  return { accessToken: "STATIC", apiBase: BASE, maxRetries: 0, retryBaseMs: 0, ...extra };
}

/** A client on the refresh flow. */
function refreshConfig(extra: Partial<GoogleContactsConfig> = {}): GoogleContactsConfig {
  return {
    clientId: "cid",
    clientSecret: "csec",
    refreshToken: "rtok",
    apiBase: BASE,
    maxRetries: 0,
    retryBaseMs: 0,
    ...extra,
  };
}

/** Installs a recording fetch stub; the handler decides each response. */
function mockFetch(handler: (url: string, init: RequestInit, n: number) => Response | Promise<Response>) {
  const original = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = (async (url: unknown, init: unknown) => {
    const i = (init ?? {}) as RequestInit & { headers?: Record<string, string> };
    calls.push({
      url: String(url),
      method: String(i.method),
      auth: i.headers?.Authorization,
      body: typeof i.body === "string" ? i.body : undefined,
    });
    return handler(String(url), i, calls.length);
  }) as typeof fetch;
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

const okJson = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });

/** Default handler: token endpoint mints TOK-1, everything else returns { ok: true }. */
function defaultHandler(url: string): Response {
  if (url === TOKEN_URL) return okJson({ access_token: "TOK-1", expires_in: 3600 });
  return okJson({ ok: true });
}

// ---- Auth ----

/**
 * The degraded-start contract: a server without credentials still runs, so the
 * client must fail the call itself — with the exact actionable message, before
 * any fetch. Zero fetch calls proves the error skips the retry/backoff loop
 * and the forced 401 re-mint alike (maxRetries is deliberately non-zero here).
 */
test("no credentials at all: CredentialsError with the exact text, fetch never called", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    const client = new GoogleContactsClient({ apiBase: BASE, maxRetries: 3, retryBaseMs: 0 });
    await assert.rejects(
      () => client.getContact("people/c1"),
      (err: unknown) => {
        assert.ok(err instanceof CredentialsError, "must be a CredentialsError");
        assert.equal(err.message, MISSING_CREDENTIALS_MESSAGE);
        // The historical startup error, verbatim — the message is the product.
        assert.ok(
          err.message.startsWith(
            "Google OAuth credentials are required: set GOOGLE_CONTACTS_CLIENT_ID + " +
              "GOOGLE_CONTACTS_CLIENT_SECRET + GOOGLE_CONTACTS_REFRESH_TOKEN (recommended), " +
              "or GOOGLE_CONTACTS_ACCESS_TOKEN with a short-lived access token.",
          ),
          "the message must open with the historical startup error, verbatim",
        );
        assert.match(err.message, /restart the server/, "the fix must mention the restart");
        return true;
      },
    );
    assert.equal(mock.calls.length, 0, "must not fetch at all — no retries, no token mint, no replay");
  } finally {
    mock.restore();
  }
});

test("static access token: Bearer header, no token-endpoint traffic", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleContactsClient(staticConfig()).getContact("people/c1");
    assert.equal(mock.calls.length, 1);
    const url = new URL(mock.calls[0].url);
    assert.equal(url.origin + url.pathname, `${BASE}/v1/people/c1`);
    assert.equal(mock.calls[0].method, "GET");
    assert.equal(mock.calls[0].auth, "Bearer STATIC");
  } finally {
    mock.restore();
  }
});

test("refresh flow: mints a token first, then caches it across requests", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    const client = new GoogleContactsClient(refreshConfig());
    await client.getContact("people/c1");
    await client.getContact("people/c2");

    const tokenCalls = mock.calls.filter((c) => c.url === TOKEN_URL);
    assert.equal(tokenCalls.length, 1, "the second request must reuse the cached token");
    assert.equal(tokenCalls[0].method, "POST");
    const params = new URLSearchParams(tokenCalls[0].body);
    assert.equal(params.get("grant_type"), "refresh_token");
    assert.equal(params.get("client_id"), "cid");
    assert.equal(params.get("client_secret"), "csec");
    assert.equal(params.get("refresh_token"), "rtok");

    const apiCalls = mock.calls.filter((c) => c.url.startsWith(`${BASE}/`));
    assert.equal(apiCalls.length, 2);
    for (const call of apiCalls) assert.equal(call.auth, "Bearer TOK-1");
  } finally {
    mock.restore();
  }
});

test("a 401 forces one re-mint and replays the request", async () => {
  let minted = 0;
  let apiHits = 0;
  const mock = mockFetch((url) => {
    if (url === TOKEN_URL) {
      minted++;
      return okJson({ access_token: `TOK-${minted}`, expires_in: 3600 });
    }
    apiHits++;
    if (apiHits === 1) return new Response('{"error":{"message":"expired"}}', { status: 401 });
    return okJson({ ok: true });
  });
  try {
    const result = await new GoogleContactsClient(refreshConfig()).getContact("people/c1");
    assert.deepEqual(result, { ok: true });
    assert.equal(minted, 2, "the 401 must force a second mint");
    const lastApi = mock.calls.filter((c) => c.url.startsWith(`${BASE}/`)).at(-1);
    assert.equal(lastApi?.auth, "Bearer TOK-2");
  } finally {
    mock.restore();
  }
});

test("a persistent 401 throws instead of looping", async () => {
  let apiHits = 0;
  const mock = mockFetch((url) => {
    if (url === TOKEN_URL) return okJson({ access_token: "TOK", expires_in: 3600 });
    apiHits++;
    return new Response('{"error":{"message":"nope","status":"UNAUTHENTICATED"}}', { status: 401 });
  });
  try {
    await assert.rejects(
      () => new GoogleContactsClient(refreshConfig()).getContact("people/c1"),
      /HTTP 401: \[UNAUTHENTICATED\] nope/,
    );
    assert.equal(apiHits, 2, "exactly one replay after the forced re-mint");
  } finally {
    mock.restore();
  }
});

test("a failed token exchange surfaces the OAuth error", async () => {
  const mock = mockFetch((url) => {
    if (url === TOKEN_URL) {
      return new Response('{"error":"invalid_grant","error_description":"Token has been revoked."}', {
        status: 400,
      });
    }
    return okJson({ ok: true });
  });
  try {
    await assert.rejects(
      () => new GoogleContactsClient(refreshConfig()).getContact("people/c1"),
      /HTTP 400: invalid_grant: Token has been revoked\./,
    );
  } finally {
    mock.restore();
  }
});

// ---- buildPerson wire mapping ----

test("buildPerson maps every normalized group to its wire field + mask entry", () => {
  const { person, fieldGroups } = buildPerson({
    givenName: "Ada",
    familyName: "Lovelace",
    prefix: "Dr.",
    nickname: "Ada",
    emails: [{ value: "ada@example.com", type: "work" }, { value: "a@b.c" }],
    phones: [{ value: "+1", type: "mobile" }],
    addresses: [{ street: "1 Main St", city: "London", postalCode: "E1", country: "UK", type: "home" }],
    organization: { name: "Analytical Engines", title: "Engineer" },
    birthday: "1815-12-10",
    notes: "First programmer",
    urls: [{ value: "https://example.com", type: "homePage" }],
  });
  assert.deepEqual(person.names, [{ givenName: "Ada", familyName: "Lovelace", honorificPrefix: "Dr." }]);
  assert.deepEqual(person.nicknames, [{ value: "Ada" }]);
  assert.deepEqual(person.emailAddresses, [{ value: "ada@example.com", type: "work" }, { value: "a@b.c" }]);
  assert.deepEqual(person.phoneNumbers, [{ value: "+1", type: "mobile" }]);
  assert.deepEqual(person.addresses, [
    { streetAddress: "1 Main St", city: "London", postalCode: "E1", country: "UK", type: "home" },
  ]);
  assert.deepEqual(person.organizations, [{ name: "Analytical Engines", title: "Engineer" }]);
  assert.deepEqual(person.birthdays, [{ date: { year: 1815, month: 12, day: 10 } }]);
  assert.deepEqual(person.biographies, [{ value: "First programmer", contentType: "TEXT_PLAIN" }]);
  assert.deepEqual(person.urls, [{ value: "https://example.com", type: "homePage" }]);
  assert.deepEqual(fieldGroups, [
    "names",
    "nicknames",
    "emailAddresses",
    "phoneNumbers",
    "addresses",
    "organizations",
    "birthdays",
    "biographies",
    "urls",
  ]);
});

test("buildPerson: yearless birthday, empty-array clearing, and bad birthday rejection", () => {
  const yearless = buildPerson({ birthday: "12-10" });
  assert.deepEqual(yearless.person.birthdays, [{ date: { month: 12, day: 10 } }]);

  // An explicit empty list is a CLEAR: the group rides in the mask with no values.
  const cleared = buildPerson({ emails: [] });
  assert.deepEqual(cleared.person.emailAddresses, []);
  assert.deepEqual(cleared.fieldGroups, ["emailAddresses"]);

  // Same for the scalar birthday: "" clears it (empty group riding in the mask).
  const clearedBirthday = buildPerson({ birthday: "" });
  assert.deepEqual(clearedBirthday.person.birthdays, []);
  assert.deepEqual(clearedBirthday.fieldGroups, ["birthdays"]);

  assert.throws(() => buildPerson({ birthday: "yesterday" }), /birthday must be/);
  assert.deepEqual(buildPerson({}).fieldGroups, []);
});

// ---- Contact reads ----

test("listContacts builds the connections query with the default mask", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleContactsClient(staticConfig()).listContacts({
      pageSize: 50,
      pageToken: "tok",
      sortOrder: "FIRST_NAME_ASCENDING",
      requestSyncToken: true,
    });
    const url = new URL(mock.calls[0].url);
    assert.equal(url.pathname, "/v1/people/me/connections");
    assert.equal(url.searchParams.get("personFields"), DEFAULT_PERSON_FIELDS);
    assert.equal(url.searchParams.get("pageSize"), "50");
    assert.equal(url.searchParams.get("pageToken"), "tok");
    assert.equal(url.searchParams.get("sortOrder"), "FIRST_NAME_ASCENDING");
    assert.equal(url.searchParams.get("requestSyncToken"), "true");
    assert.equal(mock.calls[0].method, "GET");
    assert.equal(mock.calls[0].body, undefined);
  } finally {
    mock.restore();
  }
});

test("listContacts joins an explicit person-fields mask and forwards the sync token", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleContactsClient(staticConfig()).listContacts({
      personFields: ["names", "metadata"],
      syncToken: "sync-1",
    });
    const url = new URL(mock.calls[0].url);
    assert.equal(url.searchParams.get("personFields"), "names,metadata");
    assert.equal(url.searchParams.get("syncToken"), "sync-1");
  } finally {
    mock.restore();
  }
});

test("searchContacts warms up before the FIRST search only — once per session, not per call", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    const client = new GoogleContactsClient(staticConfig());
    await client.searchContacts({ query: "ada", readMask: ["names"], pageSize: 5 });
    assert.equal(mock.calls.length, 2, "warmup + real search");
    const warmup = new URL(mock.calls[0].url);
    assert.equal(warmup.pathname, "/v1/people:searchContacts");
    assert.equal(warmup.searchParams.get("query"), "");
    assert.equal(warmup.searchParams.get("readMask"), "names");
    const real = new URL(mock.calls[1].url);
    assert.equal(real.searchParams.get("query"), "ada");
    assert.equal(real.searchParams.get("pageSize"), "5");

    // A second search must NOT repeat the warmup — it would double the spend
    // against the tight per-user quota.
    await client.searchContacts({ query: "bob" });
    assert.equal(mock.calls.length, 3, "no second warmup");
    assert.equal(new URL(mock.calls[2].url).searchParams.get("query"), "bob");
  } finally {
    mock.restore();
  }
});

test("a failed warmup is never retried and never fails or delays the search", async () => {
  let n = 0;
  const mock = mockFetch((url) => {
    n++;
    if (new URL(url).searchParams.get("query") === "") {
      return new Response("slow down", { status: 429 });
    }
    return okJson({ results: [] });
  });
  try {
    // maxRetries is deliberately non-zero: the warmup 429 must skip the
    // retry/backoff loop entirely, not burn it before the real query.
    const client = new GoogleContactsClient(staticConfig({ maxRetries: 3 }));
    const result = await client.searchContacts({ query: "ada" });
    assert.deepEqual(result, { results: [] });
    assert.equal(n, 2, "one warmup attempt (no retries) + the real search");
  } finally {
    mock.restore();
  }
});

test("getContact hits the person path; a malformed resource name never fetches", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    const client = new GoogleContactsClient(staticConfig());
    await client.getContact("people/me", ["names", "photos"]);
    const url = new URL(mock.calls[0].url);
    assert.equal(url.pathname, "/v1/people/me");
    assert.equal(url.searchParams.get("personFields"), "names,photos");

    await assert.rejects(() => client.getContact("contactGroups/oops"), /people\/<id>/);
    await assert.rejects(() => client.getContact("evil/../people/c1"), /people\/<id>/);
    assert.equal(mock.calls.length, 1, "invalid names must be rejected before any fetch");
  } finally {
    mock.restore();
  }
});

test("batchGetContacts repeats resourceNames as query parameters", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleContactsClient(staticConfig()).batchGetContacts(["people/c1", "people/c2"], ["names"]);
    const url = new URL(mock.calls[0].url);
    assert.equal(url.pathname, "/v1/people:batchGet");
    assert.deepEqual(url.searchParams.getAll("resourceNames"), ["people/c1", "people/c2"]);
    assert.equal(url.searchParams.get("personFields"), "names");
  } finally {
    mock.restore();
  }
});

// ---- Contact writes ----

test("createContact posts the wire person and asks for the compact mask back", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    const client = new GoogleContactsClient(staticConfig());
    await client.createContact({ givenName: "Ada", emails: [{ value: "a@b.c" }] });
    const url = new URL(mock.calls[0].url);
    assert.equal(url.pathname, "/v1/people:createContact");
    assert.equal(url.searchParams.get("personFields"), DEFAULT_PERSON_FIELDS);
    assert.equal(mock.calls[0].method, "POST");
    assert.deepEqual(JSON.parse(mock.calls[0].body!), {
      names: [{ givenName: "Ada" }],
      emailAddresses: [{ value: "a@b.c" }],
    });

    await assert.rejects(() => client.createContact({}), /At least one contact field/);
    assert.equal(mock.calls.length, 1, "an empty contact must be rejected before any fetch");
  } finally {
    mock.restore();
  }
});

test("updateContact with an etag PATCHes once with the computed updatePersonFields", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleContactsClient(staticConfig()).updateContact({
      resourceName: "people/c1",
      etag: "ETAG-1",
      fields: { givenName: "Ada", phones: [{ value: "+1" }] },
    });
    assert.equal(mock.calls.length, 1, "no pre-read when the etag is given");
    const url = new URL(mock.calls[0].url);
    assert.equal(url.pathname, "/v1/people/c1:updateContact");
    assert.equal(url.searchParams.get("updatePersonFields"), "names,phoneNumbers");
    assert.equal(url.searchParams.get("personFields"), DEFAULT_PERSON_FIELDS);
    assert.equal(mock.calls[0].method, "PATCH");
    assert.deepEqual(JSON.parse(mock.calls[0].body!), {
      names: [{ givenName: "Ada" }],
      phoneNumbers: [{ value: "+1" }],
      etag: "ETAG-1",
    });
  } finally {
    mock.restore();
  }
});

test("updateContact without an etag reads the contact first and reuses its etag", async () => {
  const mock = mockFetch((url) => {
    if (new URL(url).pathname === "/v1/people/c1") return okJson({ resourceName: "people/c1", etag: "FRESH" });
    return okJson({ ok: true });
  });
  try {
    await new GoogleContactsClient(staticConfig()).updateContact({
      resourceName: "people/c1",
      fields: { notes: "hi" },
    });
    assert.equal(mock.calls.length, 2);
    const read = new URL(mock.calls[0].url);
    assert.equal(mock.calls[0].method, "GET");
    assert.equal(read.searchParams.get("personFields"), "metadata");
    assert.equal(JSON.parse(mock.calls[1].body!).etag, "FRESH");
  } finally {
    mock.restore();
  }
});

test("updateContact rejects an empty update before any fetch", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await assert.rejects(
      () => new GoogleContactsClient(staticConfig()).updateContact({ resourceName: "people/c1", fields: {} }),
      /At least one contact field/,
    );
    assert.equal(mock.calls.length, 0);
  } finally {
    mock.restore();
  }
});

test("deleteContact hits :deleteContact with DELETE", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleContactsClient(staticConfig()).deleteContact("people/c9");
    assert.equal(mock.calls[0].method, "DELETE");
    assert.equal(new URL(mock.calls[0].url).pathname, "/v1/people/c9:deleteContact");
  } finally {
    mock.restore();
  }
});

// ---- Batch mutations ----

test("batchCreateContacts wraps each person as contactPerson and sends a readMask", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    const client = new GoogleContactsClient(staticConfig());
    await client.batchCreateContacts([{ givenName: "A" }, { givenName: "B" }], ["names"]);
    assert.equal(new URL(mock.calls[0].url).pathname, "/v1/people:batchCreateContacts");
    assert.deepEqual(JSON.parse(mock.calls[0].body!), {
      contacts: [{ contactPerson: { names: [{ givenName: "A" }] } }, { contactPerson: { names: [{ givenName: "B" }] } }],
      readMask: "names",
    });

    await assert.rejects(() => client.batchCreateContacts([{ givenName: "A" }, {}]), /Contact #1 has no fields/);
    assert.equal(mock.calls.length, 1, "a bad batch must be rejected before any fetch");
  } finally {
    mock.restore();
  }
});

test("batchUpdateContacts with etags posts once with the union updateMask", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleContactsClient(staticConfig()).batchUpdateContacts([
      { resourceName: "people/c1", etag: "E1", fields: { givenName: "A" } },
      { resourceName: "people/c2", etag: "E2", fields: { phones: [{ value: "+2" }] } },
    ]);
    assert.equal(mock.calls.length, 1, "no etag pre-read when every entry carries one");
    const body = JSON.parse(mock.calls[0].body!);
    assert.equal(new URL(mock.calls[0].url).pathname, "/v1/people:batchUpdateContacts");
    assert.equal(body.updateMask, "names,phoneNumbers");
    assert.deepEqual(body.contacts["people/c1"], { names: [{ givenName: "A" }], etag: "E1" });
    assert.deepEqual(body.contacts["people/c2"], { phoneNumbers: [{ value: "+2" }], etag: "E2" });
    assert.equal(body.readMask, DEFAULT_PERSON_FIELDS);
  } finally {
    mock.restore();
  }
});

test("batchUpdateContacts fetches missing etags in one batchGet first", async () => {
  const mock = mockFetch((url) => {
    if (new URL(url).pathname === "/v1/people:batchGet") {
      return okJson({
        responses: [{ requestedResourceName: "people/c2", person: { resourceName: "people/c2", etag: "FETCHED" } }],
      });
    }
    return okJson({ ok: true });
  });
  try {
    await new GoogleContactsClient(staticConfig()).batchUpdateContacts([
      { resourceName: "people/c1", etag: "E1", fields: { givenName: "A" } },
      { resourceName: "people/c2", fields: { givenName: "B" } },
    ]);
    assert.equal(mock.calls.length, 2);
    const pre = new URL(mock.calls[0].url);
    assert.equal(pre.pathname, "/v1/people:batchGet");
    assert.deepEqual(pre.searchParams.getAll("resourceNames"), ["people/c2"]);
    assert.equal(pre.searchParams.get("personFields"), "metadata");
    const body = JSON.parse(mock.calls[1].body!);
    assert.equal(body.contacts["people/c2"].etag, "FETCHED");
  } finally {
    mock.restore();
  }
});

test("batchUpdateContacts fails when an etag cannot be resolved", async () => {
  const mock = mockFetch((url) => {
    if (new URL(url).pathname === "/v1/people:batchGet") return okJson({ responses: [] });
    return okJson({ ok: true });
  });
  try {
    await assert.rejects(
      () =>
        new GoogleContactsClient(staticConfig()).batchUpdateContacts([
          { resourceName: "people/c404", fields: { givenName: "X" } },
        ]),
      /Could not read the current etag/,
    );
    assert.equal(mock.calls.length, 1, "only the batchGet, never the mutation");
  } finally {
    mock.restore();
  }
});

test("batchDeleteContacts posts the resource names", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleContactsClient(staticConfig()).batchDeleteContacts(["people/c1", "people/c2"]);
    assert.equal(new URL(mock.calls[0].url).pathname, "/v1/people:batchDeleteContacts");
    assert.deepEqual(JSON.parse(mock.calls[0].body!), { resourceNames: ["people/c1", "people/c2"] });
  } finally {
    mock.restore();
  }
});

// ---- Contact groups ----

test("group reads: list with joined groupFields, get with maxMembers", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    const client = new GoogleContactsClient(staticConfig());
    await client.listContactGroups({ pageSize: 10, groupFields: ["name", "memberCount"] });
    const list = new URL(mock.calls[0].url);
    assert.equal(list.pathname, "/v1/contactGroups");
    assert.equal(list.searchParams.get("pageSize"), "10");
    assert.equal(list.searchParams.get("groupFields"), "name,memberCount");

    await client.getContactGroup("contactGroups/abc", { maxMembers: 25 });
    const get = new URL(mock.calls[1].url);
    assert.equal(get.pathname, "/v1/contactGroups/abc");
    assert.equal(get.searchParams.get("maxMembers"), "25");
    assert.equal(get.searchParams.get("groupFields"), null, "no groupFields unless asked");
  } finally {
    mock.restore();
  }
});

test("createContactGroup posts the wrapped group", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleContactsClient(staticConfig()).createContactGroup("Friends");
    assert.equal(new URL(mock.calls[0].url).pathname, "/v1/contactGroups");
    assert.deepEqual(JSON.parse(mock.calls[0].body!), { contactGroup: { name: "Friends" } });
  } finally {
    mock.restore();
  }
});

test("updateContactGroup PUTs with the given etag, or fetches one first", async () => {
  const mock = mockFetch((url, init) => {
    if (init.method === "GET") return okJson({ resourceName: "contactGroups/g1", etag: "G-FRESH" });
    return okJson({ ok: true });
  });
  try {
    const client = new GoogleContactsClient(staticConfig());
    await client.updateContactGroup({ resourceName: "contactGroups/g1", name: "New", etag: "G-1" });
    assert.equal(mock.calls.length, 1, "no pre-read when the etag is given");
    assert.equal(mock.calls[0].method, "PUT");
    assert.equal(new URL(mock.calls[0].url).pathname, "/v1/contactGroups/g1");
    assert.deepEqual(JSON.parse(mock.calls[0].body!), { contactGroup: { name: "New", etag: "G-1" } });

    await client.updateContactGroup({ resourceName: "contactGroups/g1", name: "Newer" });
    assert.equal(mock.calls.length, 3);
    assert.equal(mock.calls[1].method, "GET");
    assert.deepEqual(JSON.parse(mock.calls[2].body!), { contactGroup: { name: "Newer", etag: "G-FRESH" } });
  } finally {
    mock.restore();
  }
});

test("deleteContactGroup forwards deleteContacts only when set", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    const client = new GoogleContactsClient(staticConfig());
    await client.deleteContactGroup("contactGroups/g1");
    assert.equal(mock.calls[0].method, "DELETE");
    assert.equal(new URL(mock.calls[0].url).searchParams.get("deleteContacts"), null);

    await client.deleteContactGroup("contactGroups/g1", true);
    assert.equal(new URL(mock.calls[1].url).searchParams.get("deleteContacts"), "true");
  } finally {
    mock.restore();
  }
});

test("modifyGroupMembers posts add/remove lists and validates member names first", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    const client = new GoogleContactsClient(staticConfig());
    await client.modifyGroupMembers({ resourceName: "contactGroups/g1", add: ["people/c1"], remove: ["people/c2"] });
    assert.equal(new URL(mock.calls[0].url).pathname, "/v1/contactGroups/g1/members:modify");
    assert.deepEqual(JSON.parse(mock.calls[0].body!), {
      resourceNamesToAdd: ["people/c1"],
      resourceNamesToRemove: ["people/c2"],
    });

    await assert.rejects(
      () => client.modifyGroupMembers({ resourceName: "contactGroups/g1", add: ["not-a-person"] }),
      /people\/<id>/,
    );
    assert.equal(mock.calls.length, 1, "invalid member names must be rejected before any fetch");
  } finally {
    mock.restore();
  }
});

// ---- Other contacts ----

test("listOtherContacts uses the restricted default read mask", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleContactsClient(staticConfig()).listOtherContacts({ pageSize: 200, requestSyncToken: true });
    const url = new URL(mock.calls[0].url);
    assert.equal(url.pathname, "/v1/otherContacts");
    assert.equal(url.searchParams.get("readMask"), "names,emailAddresses,phoneNumbers");
    assert.equal(url.searchParams.get("pageSize"), "200");
    assert.equal(url.searchParams.get("requestSyncToken"), "true");
  } finally {
    mock.restore();
  }
});

test("searchOtherContacts warms up before its first search — tracked separately from searchContacts", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    const client = new GoogleContactsClient(staticConfig());
    // Warming people:searchContacts must not mark otherContacts:search warm.
    await client.searchContacts({ query: "ada" });
    assert.equal(mock.calls.length, 2);

    await client.searchOtherContacts({ query: "bob", pageSize: 3 });
    assert.equal(mock.calls.length, 4, "its own warmup + real search");
    const warmup = new URL(mock.calls[2].url);
    assert.equal(warmup.pathname, "/v1/otherContacts:search");
    assert.equal(warmup.searchParams.get("query"), "");
    const real = new URL(mock.calls[3].url);
    assert.equal(real.pathname, "/v1/otherContacts:search");
    assert.equal(real.searchParams.get("query"), "bob");

    await client.searchOtherContacts({ query: "carol" });
    assert.equal(mock.calls.length, 5, "no second warmup for Other contacts either");
  } finally {
    mock.restore();
  }
});

test("copyOtherContact posts copyMask/readMask to the copy endpoint", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleContactsClient(staticConfig()).copyOtherContact({ resourceName: "otherContacts/o1" });
    assert.equal(
      new URL(mock.calls[0].url).pathname,
      "/v1/otherContacts/o1:copyOtherContactToMyContactsGroup",
    );
    assert.deepEqual(JSON.parse(mock.calls[0].body!), {
      copyMask: "names,emailAddresses,phoneNumbers",
      readMask: DEFAULT_PERSON_FIELDS,
    });
  } finally {
    mock.restore();
  }
});

// ---- Retry / timeout / SSRF behavior ----

test("request() retries a 429 for reads and writes alike", async () => {
  for (const run of [
    () => new GoogleContactsClient(staticConfig({ maxRetries: 3 })).getContact("people/c1"),
    () => new GoogleContactsClient(staticConfig({ maxRetries: 3 })).deleteContact("people/c1"),
  ]) {
    let n = 0;
    const mock = mockFetch(() => {
      n++;
      if (n === 1) return new Response("slow down", { status: 429 });
      return okJson({ ok: true });
    });
    try {
      assert.deepEqual(await run(), { ok: true });
      assert.equal(n, 2);
    } finally {
      mock.restore();
    }
  }
});

test("request() retries a 5xx only for GET — a write is never replayed", async () => {
  let n = 0;
  const mock = mockFetch(() => {
    n++;
    if (n === 1) return new Response("unavailable", { status: 503 });
    return okJson({ ok: true });
  });
  try {
    const result = await new GoogleContactsClient(staticConfig({ maxRetries: 3 })).getContact("people/c1");
    assert.deepEqual(result, { ok: true });
    assert.equal(n, 2, "the read is retried");
  } finally {
    mock.restore();
  }

  n = 0;
  const mock2 = mockFetch(() => {
    n++;
    return new Response("unavailable", { status: 503 });
  });
  try {
    await assert.rejects(
      () => new GoogleContactsClient(staticConfig({ maxRetries: 3 })).deleteContact("people/c1"),
      /HTTP 503/,
    );
    assert.equal(n, 1, "a 503 on a write must not be replayed — the delete may have committed");
  } finally {
    mock2.restore();
  }
});

test("request() retries a network error only for GET", async () => {
  let n = 0;
  const mock = mockFetch(() => {
    n++;
    if (n === 1) throw new Error("ECONNRESET");
    return okJson({ ok: true });
  });
  try {
    const result = await new GoogleContactsClient(staticConfig({ maxRetries: 2 })).getContact("people/c1");
    assert.deepEqual(result, { ok: true });
    assert.equal(n, 2);
  } finally {
    mock.restore();
  }

  n = 0;
  const mock2 = mockFetch(() => {
    n++;
    throw new Error("ECONNRESET");
  });
  try {
    await assert.rejects(
      () => new GoogleContactsClient(staticConfig({ maxRetries: 2 })).createContact({ givenName: "A" }),
      /ECONNRESET/,
    );
    assert.equal(n, 1, "a network error on a write must not be replayed");
  } finally {
    mock2.restore();
  }
});

test("request() does not retry a 400 and gives up after maxRetries on 429", async () => {
  let n = 0;
  const mock = mockFetch(() => {
    n++;
    return new Response('{"error":{"message":"bad","status":"INVALID_ARGUMENT"}}', { status: 400 });
  });
  try {
    await assert.rejects(
      () => new GoogleContactsClient(staticConfig({ maxRetries: 3 })).getContact("people/c1"),
      /HTTP 400: \[INVALID_ARGUMENT\] bad/,
    );
    assert.equal(n, 1);
  } finally {
    mock.restore();
  }

  n = 0;
  const mock2 = mockFetch(() => {
    n++;
    return new Response("slow down", { status: 429 });
  });
  try {
    await assert.rejects(
      () => new GoogleContactsClient(staticConfig({ maxRetries: 2 })).getContact("people/c1"),
      /HTTP 429/,
    );
    assert.equal(n, 3); // initial + 2 retries
  } finally {
    mock2.restore();
  }
});

test("backoffMs honors Retry-After as delay-seconds AND as an HTTP-date", () => {
  const client = new GoogleContactsClient(staticConfig({ retryBaseMs: 500 }));
  const backoff = (retryAfter?: string) =>
    (client as unknown as { backoffMs(attempt: number, res?: Response): number }).backoffMs(
      0,
      retryAfter === undefined
        ? undefined
        : new Response("", { status: 429, headers: { "Retry-After": retryAfter } }),
    );

  assert.equal(backoff("2"), 2000, "delay-seconds form");
  assert.equal(backoff("3600"), 30_000, "delay-seconds capped at 30s");

  const future = backoff(new Date(Date.now() + 5000).toUTCString());
  assert.ok(future > 3000 && future <= 5000, `HTTP-date form must be honored (got ${future}ms)`);
  const farFuture = backoff(new Date(Date.now() + 120_000).toUTCString());
  assert.equal(farFuture, 30_000, "HTTP-date capped at 30s");

  // A past date, garbage or no header falls back to the exponential schedule.
  assert.equal(backoff(new Date(Date.now() - 5000).toUTCString()), 500);
  assert.equal(backoff("soon"), 500);
  assert.equal(backoff(), 500);
});

test("request() aborts and reports a timeout when the request hangs", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = ((_url: unknown, init: unknown) =>
    new Promise((_resolve, reject) => {
      const signal = (init as RequestInit).signal as AbortSignal;
      signal.addEventListener("abort", () =>
        reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
      );
    })) as typeof fetch;
  try {
    const client = new GoogleContactsClient(staticConfig({ timeoutMs: 10, maxRetries: 0 }));
    await client.getContact("people/c1").then(
      () => assert.fail("must reject"),
      (err) => assert.match(String(err), /timed out after 10ms/),
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("request() rejects an absolute path (SSRF) and never fetches a foreign origin", async () => {
  for (const evil of ["https://evil.example/steal", "http://evil.example/x", "\\\\evil.example/x"]) {
    const mock = mockFetch(() => okJson({}));
    try {
      await assert.rejects(
        () => new GoogleContactsClient(staticConfig()).request("GET", evil),
        /foreign origin/,
      );
      assert.equal(mock.calls.length, 0, `must not fetch for ${JSON.stringify(evil)}`);
    } finally {
      mock.restore();
    }
  }
});

test("request() still accepts a relative API path with a query string", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    const result = await new GoogleContactsClient(staticConfig()).request(
      "GET",
      "v1/people/c1?personFields=names",
    );
    assert.deepEqual(result, { ok: true });
    assert.equal(mock.calls[0].url, `${BASE}/v1/people/c1?personFields=names`);
  } finally {
    mock.restore();
  }
});
