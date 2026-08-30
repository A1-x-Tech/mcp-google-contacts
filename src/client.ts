import type { ContactFields, GoogleContactsConfig, SortOrder } from "./types.js";
import { GoogleContactsError } from "./types.js";
import { CredentialsError } from "./config.js";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Google's OAuth2 token endpoint — refresh tokens are exchanged here. */
const TOKEN_URL = "https://oauth2.googleapis.com/token";

/**
 * The field mask sent when a tool does not ask for specific person fields.
 * The People API requires an explicit mask on every read — there is no
 * server-side default — so this compact set is what "a contact" means here;
 * tools widen it per call via person_fields/read_mask.
 */
export const DEFAULT_PERSON_FIELDS = "names,emailAddresses,phoneNumbers,organizations,memberships";

/**
 * "Other contacts" only ever carry names, emails, phones (+ photos/metadata),
 * and their endpoints reject the wider person mask — hence a separate default.
 */
export const DEFAULT_OTHER_CONTACT_FIELDS = "names,emailAddresses,phoneNumbers";

/** Query values: scalars are set once; arrays become repeated parameters (e.g. resourceNames). */
type QueryValue = string | number | boolean | undefined | string[];

/** Normalized inputs for list_contacts. */
export interface ListContactsParams {
  personFields?: string[];
  pageSize?: number;
  pageToken?: string;
  sortOrder?: SortOrder;
  requestSyncToken?: boolean;
  syncToken?: string;
}

/** Normalized inputs for search_contacts / the Other-contacts search. */
export interface SearchParams {
  query: string;
  readMask?: string[];
  pageSize?: number;
}

/** Normalized inputs for update_contact. */
export interface UpdateContactParams {
  resourceName: string;
  /** Current etag; fetched automatically (one extra GET) when omitted. */
  etag?: string;
  fields: ContactFields;
  /** Field mask for the returned person. */
  personFields?: string[];
}

/** One entry of batch_update_contacts. */
export interface BatchUpdateEntry {
  resourceName: string;
  etag?: string;
  fields: ContactFields;
}

/** Normalized inputs for list_other_contacts (listing mode). */
export interface ListOtherContactsParams {
  readMask?: string[];
  pageSize?: number;
  pageToken?: string;
  requestSyncToken?: boolean;
  syncToken?: string;
}

/**
 * Validates a full resource name of the given collection before it is spliced
 * into a URL path. The error names the expected shape but never echoes the
 * input back — a mistyped "name" may well be a real person's data.
 */
function assertResourceName(name: string, kind: "people" | "contactGroups" | "otherContacts"): void {
  if (!new RegExp(`^${kind}/[a-zA-Z0-9_-]+$`).test(name)) {
    throw new Error(
      `Invalid ${kind} resource name — pass the full "${kind}/<id>" form exactly as the API returned it, never a bare id.`,
    );
  }
}

/** Parses the normalized birthday string into the API's structured Date. */
function parseBirthday(value: string): { year?: number; month: number; day: number } {
  const match = /^(?:(\d{4})-)?(\d{1,2})-(\d{1,2})$/.exec(value);
  const month = match ? Number(match[2]) : 0;
  const day = match ? Number(match[3]) : 0;
  if (!match || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error('birthday must be "YYYY-MM-DD" or "MM-DD" (a real calendar month and day).');
  }
  return compact({ year: match[1] ? Number(match[1]) : undefined, month, day });
}

/**
 * Builds a People API Person from the normalized contact vocabulary and
 * returns it together with the touched field groups — that list IS the
 * computed `updatePersonFields`/`updateMask` for the mutation endpoints.
 * Pure wire mapping. A group left `undefined` is omitted entirely (and stays
 * out of the mask); a provided-but-empty group ([], "") becomes an empty
 * array that, riding in the mask, tells updateContact to CLEAR the group.
 */
export function buildPerson(f: ContactFields): {
  person: Record<string, unknown>;
  fieldGroups: string[];
} {
  const person: Record<string, unknown> = {};
  const fieldGroups: string[] = [];
  const put = (group: string, value: unknown): void => {
    person[group] = value;
    fieldGroups.push(group);
  };

  if ([f.givenName, f.middleName, f.familyName, f.prefix, f.suffix].some((v) => v !== undefined)) {
    const name = compact({
      givenName: f.givenName,
      middleName: f.middleName,
      familyName: f.familyName,
      honorificPrefix: f.prefix,
      honorificSuffix: f.suffix,
    });
    put("names", Object.values(name).some((v) => v !== "") ? [name] : []);
  }
  if (f.nickname !== undefined) put("nicknames", f.nickname ? [{ value: f.nickname }] : []);
  if (f.emails !== undefined) {
    put(
      "emailAddresses",
      f.emails.map((e) => compact({ value: e.value, type: e.type })),
    );
  }
  if (f.phones !== undefined) {
    put(
      "phoneNumbers",
      f.phones.map((p) => compact({ value: p.value, type: p.type })),
    );
  }
  if (f.addresses !== undefined) {
    put(
      "addresses",
      f.addresses.map((a) =>
        compact({
          streetAddress: a.street,
          city: a.city,
          region: a.region,
          postalCode: a.postalCode,
          country: a.country,
          type: a.type,
        }),
      ),
    );
  }
  if (f.organization !== undefined) {
    const org = compact({
      name: f.organization.name,
      title: f.organization.title,
      department: f.organization.department,
    });
    put("organizations", Object.keys(org).length ? [org] : []);
  }
  if (f.birthday !== undefined) {
    put("birthdays", f.birthday ? [{ date: parseBirthday(f.birthday) }] : []);
  }
  if (f.notes !== undefined) {
    put("biographies", f.notes ? [{ value: f.notes, contentType: "TEXT_PLAIN" }] : []);
  }
  if (f.urls !== undefined) {
    put(
      "urls",
      f.urls.map((u) => compact({ value: u.value, type: u.type })),
    );
  }
  return { person, fieldGroups };
}

export class GoogleContactsClient {
  private readonly base: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;
  /** Cached access token from the refresh flow, with its expiry. */
  private cachedToken?: { value: string; expiresAt: number };
  /** In-flight refresh, deduping concurrent token requests. */
  private refreshInFlight?: Promise<string>;
  /** Search endpoints whose server-side cache was already warmed this session. */
  private readonly warmedSearchPaths = new Set<string>();

  constructor(private readonly config: GoogleContactsConfig) {
    this.base = config.apiBase.endsWith("/") ? config.apiBase : config.apiBase + "/";
    this.timeoutMs = config.timeoutMs ?? 60_000;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryBaseMs = config.retryBaseMs ?? 500;
  }

  private canRefresh(): boolean {
    return Boolean(this.config.refreshToken && this.config.clientId && this.config.clientSecret);
  }

  /**
   * Returns a valid Bearer token. With the refresh triple configured, mints an
   * access token from the refresh token and caches it until shortly before it
   * expires (concurrent callers share one in-flight refresh); otherwise the
   * static GOOGLE_CONTACTS_ACCESS_TOKEN is used as-is. With neither configured,
   * throws {@link CredentialsError} BEFORE any fetch — a missing setup must
   * never enter the retry/backoff loop or trigger the 401 re-mint, because no
   * amount of retrying mints credentials.
   */
  private async accessToken(forceRefresh = false): Promise<string> {
    if (!this.canRefresh()) {
      if (!this.config.accessToken) throw new CredentialsError();
      return this.config.accessToken;
    }
    if (!forceRefresh && this.cachedToken && Date.now() < this.cachedToken.expiresAt) {
      return this.cachedToken.value;
    }
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.refreshAccessToken().finally(() => {
        this.refreshInFlight = undefined;
      });
    }
    return this.refreshInFlight;
  }

  /** Exchanges the refresh token for a fresh access token at Google's token endpoint. */
  private async refreshAccessToken(): Promise<string> {
    const body = new URLSearchParams({
      client_id: this.config.clientId as string,
      client_secret: this.config.clientSecret as string,
      refresh_token: this.config.refreshToken as string,
      grant_type: "refresh_token",
    }).toString();

    const { res, text } = await this.fetchWithTimeout(
      TOKEN_URL,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body },
      "oauth2 token refresh",
    );

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    if (!res.ok) throw new GoogleContactsError(res.status, data);

    const token = (data as { access_token?: unknown }).access_token;
    if (typeof token !== "string" || !token) {
      throw new Error("OAuth2 token endpoint returned no access_token.");
    }
    const expiresIn = Number((data as { expires_in?: unknown }).expires_in);
    const ttl = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600;
    // Refresh 60s ahead of the real expiry so requests never race a dying token.
    this.cachedToken = { value: token, expiresAt: Date.now() + Math.max(ttl - 60, 30) * 1000 };
    return token;
  }

  /** Verifies the OAuth credentials by minting a fresh access token (refresh flow only). */
  async authCheck(): Promise<unknown> {
    if (!this.canRefresh()) {
      throw new Error(
        "authCheck needs the refresh flow (GOOGLE_CONTACTS_CLIENT_ID / _CLIENT_SECRET / _REFRESH_TOKEN); with a static GOOGLE_CONTACTS_ACCESS_TOKEN fetch a contact instead.",
      );
    }
    await this.accessToken(true);
    return { ok: true, auth: "refresh_token" };
  }

  /**
   * Backoff before a retry: honors Retry-After when present — in both RFC 9110
   * forms, delay-seconds and HTTP-date — else exponential. Capped at 30s either
   * way; a past or unparsable date falls back to the exponential schedule.
   */
  private backoffMs(attempt: number, res?: Response): number {
    const header = res?.headers.get("Retry-After");
    if (header) {
      const seconds = Number(header);
      const waitMs = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
      if (Number.isFinite(waitMs) && waitMs > 0) return Math.min(waitMs, 30_000);
    }
    return Math.min(this.retryBaseMs * 2 ** attempt, 30_000);
  }

  /**
   * fetch with an AbortController timeout. Reads the response body inside the
   * guarded zone so the timeout also covers a slow or drip-feeding body, not
   * just the initial headers, and returns the text alongside the response.
   */
  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    label: string,
  ): Promise<{ res: Response; text: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      const text = await res.text();
      return { res, text };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Request to "${label}" timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Low-level request to a Google People API path (e.g. "v1/people/c123").
   * Auth is a Bearer token (refreshed transparently; a 401 forces one re-mint
   * + retry). 429 is always retried with backoff; 5xx and network
   * errors/timeouts are retried only for GET — the People API has real writes,
   * and retrying a create/update/delete after an ambiguous failure would apply
   * it twice. Any other non-2xx throws a {@link GoogleContactsError}.
   * `opts.retries` overrides the configured retry budget for this one call
   * (the warmup request runs with 0 so its backoff never delays the real one).
   */
  async request<T = unknown>(
    method: HttpMethod,
    path: string,
    body?: Record<string, unknown>,
    query?: Record<string, QueryValue>,
    opts?: { retries?: number },
  ): Promise<T> {
    const maxRetries = opts?.retries ?? this.maxRetries;
    // Guard method !== "GET" keeps undici from crashing on a GET-with-body.
    const hasBody = body !== undefined && method !== "GET";

    // Resolve the path against the API base, then reject anything that escaped
    // to a foreign origin (an absolute "https://evil/x" or a "\\evil/x" slipped
    // through raw_request) so the Bearer token can never leak to another host.
    const url = new URL(path.replace(/^\//, ""), this.base);
    if (url.origin !== new URL(this.base).origin) {
      throw new Error(`raw_request path must be a relative API path (resolved to foreign origin ${url.origin})`);
    }
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          for (const item of value) url.searchParams.append(key, item);
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }
    const target = url.toString();

    // Writes must not be replayed on ambiguous failures (see the retry gate below).
    const idempotent = method === "GET";
    let refreshedOn401 = false;

    for (let attempt = 0; ; attempt++) {
      const token = await this.accessToken();
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (hasBody) headers["Content-Type"] = "application/json";

      let res: Response;
      let text: string;
      try {
        ({ res, text } = await this.fetchWithTimeout(
          target,
          { method, headers, body: hasBody ? JSON.stringify(body) : undefined },
          path,
        ));
      } catch (err) {
        // Network error or timeout: the request may or may not have reached the
        // API, so only reads are retried; writes rethrow immediately.
        if (idempotent && attempt < maxRetries) {
          await delay(this.backoffMs(attempt));
          continue;
        }
        throw err;
      }

      // An expired/revoked access token: re-mint once and replay. The request
      // never executed, so this is safe for writes too.
      if (res.status === 401 && this.canRefresh() && !refreshedOn401) {
        refreshedOn401 = true;
        await this.accessToken(true);
        continue;
      }

      // 429 means the request was rejected before executing — safe to retry for
      // any method. 5xx is ambiguous (the write may have committed), so it is
      // gated to idempotent requests.
      const transient = res.status === 429 || (idempotent && res.status >= 500 && res.status < 600);
      if (transient && attempt < maxRetries) {
        await delay(this.backoffMs(attempt, res));
        continue;
      }

      let data: unknown = undefined;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }

      if (!res.ok) throw new GoogleContactsError(res.status, data);
      return data as T;
    }
  }

  /** Joins a person-fields mask, falling back to the compact default. */
  private mask(fields: string[] | undefined, fallback: string = DEFAULT_PERSON_FIELDS): string {
    return fields && fields.length > 0 ? fields.join(",") : fallback;
  }

  /**
   * Sends the warmup request Google's docs recommend (an empty query primes
   * the server-side search cache) — ONCE per endpoint per client session, not
   * before every search: repeating it would double the spend against the tight
   * per-user quota (~90 requests/min). It runs with retries disabled — a
   * warmup 429 must not burn seconds of backoff before the real query — and a
   * failure is swallowed: it only costs result freshness, never the search.
   */
  private async warmupSearch(path: string, readMask: string): Promise<void> {
    if (this.warmedSearchPaths.has(path)) return;
    this.warmedSearchPaths.add(path);
    await this.request("GET", path, undefined, { query: "", readMask }, { retries: 0 }).catch(
      () => undefined,
    );
  }

  // ---- Contacts: read ----

  /**
   * Lists the account's contacts (people/me/connections) with pagination,
   * sorting and incremental sync via sync tokens. The People API requires an
   * explicit personFields mask; the compact default fills in when the tool
   * passes none.
   */
  async listContacts(p: ListContactsParams = {}): Promise<unknown> {
    return this.request(
      "GET",
      "v1/people/me/connections",
      undefined,
      compact({
        personFields: this.mask(p.personFields),
        pageSize: p.pageSize,
        pageToken: p.pageToken,
        sortOrder: p.sortOrder,
        requestSyncToken: p.requestSyncToken,
        syncToken: p.syncToken,
      }),
    );
  }

  /**
   * Searches the account's saved contacts. The first search of the session
   * warms the server-side cache first (see {@link warmupSearch}); later
   * searches go straight to the real query.
   */
  async searchContacts(p: SearchParams): Promise<unknown> {
    const readMask = this.mask(p.readMask);
    await this.warmupSearch("v1/people:searchContacts", readMask);
    return this.request(
      "GET",
      "v1/people:searchContacts",
      undefined,
      compact({ query: p.query, readMask, pageSize: p.pageSize }),
    );
  }

  /** One person by resource name ("people/c...", or "people/me" for the caller). */
  async getContact(resourceName: string, personFields?: string[]): Promise<unknown> {
    assertResourceName(resourceName, "people");
    return this.request("GET", `v1/${resourceName}`, undefined, {
      personFields: this.mask(personFields),
    });
  }

  /** Up to 200 people in one call (people:batchGet with repeated resourceNames). */
  async batchGetContacts(resourceNames: string[], personFields?: string[]): Promise<unknown> {
    for (const name of resourceNames) assertResourceName(name, "people");
    return this.request("GET", "v1/people:batchGet", undefined, {
      resourceNames,
      personFields: this.mask(personFields),
    });
  }

  // ---- Contacts: write ----

  /** Creates one contact from the normalized vocabulary; returns the person with the given mask. */
  async createContact(fields: ContactFields, personFields?: string[]): Promise<unknown> {
    const { person, fieldGroups } = buildPerson(fields);
    if (fieldGroups.length === 0) throw new Error("At least one contact field is required.");
    return this.request("POST", "v1/people:createContact", person, {
      personFields: this.mask(personFields),
    });
  }

  /**
   * Updates one contact. The People API demands the person's current etag —
   * a stale etag fails with 400 so concurrent edits are never silently
   * overwritten. When the caller has no etag, the current one is fetched
   * first (a GET, so retry-safe); the PATCH itself is never retried on
   * ambiguous failures. `updatePersonFields` is the computed group list from
   * buildPerson, and each masked group is replaced as a whole.
   */
  async updateContact(p: UpdateContactParams): Promise<unknown> {
    assertResourceName(p.resourceName, "people");
    const { person, fieldGroups } = buildPerson(p.fields);
    if (fieldGroups.length === 0) throw new Error("At least one contact field to update is required.");
    let etag = p.etag;
    if (!etag) {
      const current = await this.request<{ etag?: string }>("GET", `v1/${p.resourceName}`, undefined, {
        personFields: "metadata",
      });
      etag = current.etag;
      if (!etag) throw new Error("Could not read the current etag of the contact — does it still exist?");
    }
    return this.request(
      "PATCH",
      `v1/${p.resourceName}:updateContact`,
      { ...person, etag },
      {
        updatePersonFields: fieldGroups.join(","),
        personFields: this.mask(p.personFields),
      },
    );
  }

  /** Deletes one contact permanently. */
  async deleteContact(resourceName: string): Promise<unknown> {
    assertResourceName(resourceName, "people");
    return this.request("DELETE", `v1/${resourceName}:deleteContact`);
  }

  // ---- Contacts: batch mutations ----

  /** Creates up to 200 contacts in one call; atomic per request. */
  async batchCreateContacts(contacts: ContactFields[], readMask?: string[]): Promise<unknown> {
    const wrapped = contacts.map((fields, i) => {
      const { person, fieldGroups } = buildPerson(fields);
      if (fieldGroups.length === 0) {
        throw new Error(`Contact #${i} has no fields — every entry needs at least one contact field.`);
      }
      return { contactPerson: person };
    });
    return this.request("POST", "v1/people:batchCreateContacts", {
      contacts: wrapped,
      readMask: this.mask(readMask),
    });
  }

  /**
   * Updates up to 200 contacts in one call. The API applies ONE shared
   * updateMask — computed here as the union of every entry's field groups, so
   * a group provided by one entry and omitted by another is CLEARED on the
   * latter (documented on the tool). Missing etags are resolved with a single
   * batchGet (a GET, retry-safe) before the one write.
   */
  async batchUpdateContacts(updates: BatchUpdateEntry[], readMask?: string[]): Promise<unknown> {
    const built = updates.map((u, i) => {
      assertResourceName(u.resourceName, "people");
      const { person, fieldGroups } = buildPerson(u.fields);
      if (fieldGroups.length === 0) {
        throw new Error(`Update #${i} has no fields — every entry needs at least one contact field.`);
      }
      return { ...u, person, fieldGroups };
    });

    const unionMask: string[] = [];
    for (const b of built) {
      for (const group of b.fieldGroups) if (!unionMask.includes(group)) unionMask.push(group);
    }

    const missing = built.filter((b) => !b.etag).map((b) => b.resourceName);
    const etags = new Map<string, string>();
    if (missing.length > 0) {
      const res = await this.request<{
        responses?: { requestedResourceName?: string; person?: { resourceName?: string; etag?: string } }[];
      }>("GET", "v1/people:batchGet", undefined, { resourceNames: missing, personFields: "metadata" });
      for (const r of res.responses ?? []) {
        const rn = r.requestedResourceName ?? r.person?.resourceName;
        if (rn && r.person?.etag) etags.set(rn, r.person.etag);
      }
    }

    const contacts: Record<string, unknown> = {};
    for (const b of built) {
      const etag = b.etag ?? etags.get(b.resourceName);
      if (!etag) {
        throw new Error("Could not read the current etag of every contact — check that they all exist.");
      }
      contacts[b.resourceName] = { ...b.person, etag };
    }
    return this.request("POST", "v1/people:batchUpdateContacts", {
      contacts,
      updateMask: unionMask.join(","),
      readMask: this.mask(readMask),
    });
  }

  /** Deletes up to 500 contacts in one call. Permanent for every one of them. */
  async batchDeleteContacts(resourceNames: string[]): Promise<unknown> {
    for (const name of resourceNames) assertResourceName(name, "people");
    return this.request("POST", "v1/people:batchDeleteContacts", { resourceNames });
  }

  // ---- Contact groups ----

  /** Lists contact groups (user labels and system groups like myContacts/starred). */
  async listContactGroups(
    p: { pageSize?: number; pageToken?: string; groupFields?: string[]; syncToken?: string } = {},
  ): Promise<unknown> {
    return this.request(
      "GET",
      "v1/contactGroups",
      undefined,
      compact({
        pageSize: p.pageSize,
        pageToken: p.pageToken,
        groupFields: p.groupFields?.length ? p.groupFields.join(",") : undefined,
        syncToken: p.syncToken,
      }),
    );
  }

  /** One group by resource name; maxMembers > 0 also returns memberResourceNames. */
  async getContactGroup(
    resourceName: string,
    opts: { maxMembers?: number; groupFields?: string[] } = {},
  ): Promise<unknown> {
    assertResourceName(resourceName, "contactGroups");
    return this.request(
      "GET",
      `v1/${resourceName}`,
      undefined,
      compact({
        maxMembers: opts.maxMembers,
        groupFields: opts.groupFields?.length ? opts.groupFields.join(",") : undefined,
      }),
    );
  }

  /** Creates a user contact group with the given display name. */
  async createContactGroup(name: string): Promise<unknown> {
    return this.request("POST", "v1/contactGroups", { contactGroup: { name } });
  }

  /**
   * Renames a user contact group. Like contacts, groups are etag-guarded:
   * the current etag is fetched first (GET, retry-safe) when not provided.
   */
  async updateContactGroup(p: { resourceName: string; name: string; etag?: string }): Promise<unknown> {
    assertResourceName(p.resourceName, "contactGroups");
    let etag = p.etag;
    if (!etag) {
      const current = await this.request<{ etag?: string }>("GET", `v1/${p.resourceName}`);
      etag = current.etag;
      if (!etag) throw new Error("Could not read the current etag of the contact group — does it still exist?");
    }
    return this.request("PUT", `v1/${p.resourceName}`, { contactGroup: { name: p.name, etag } });
  }

  /** Deletes a user group; deleteContacts=true also deletes all its member contacts. */
  async deleteContactGroup(resourceName: string, deleteContacts?: boolean): Promise<unknown> {
    assertResourceName(resourceName, "contactGroups");
    return this.request("DELETE", `v1/${resourceName}`, undefined, compact({ deleteContacts }));
  }

  /**
   * Adds/removes contacts to/from a group in one call. The response lists
   * notFoundResourceNames and canNotRemoveLastContactGroupResourceNames —
   * a 200 does not mean every member changed; the tool surfaces the body as-is.
   */
  async modifyGroupMembers(p: { resourceName: string; add?: string[]; remove?: string[] }): Promise<unknown> {
    assertResourceName(p.resourceName, "contactGroups");
    for (const member of [...(p.add ?? []), ...(p.remove ?? [])]) assertResourceName(member, "people");
    return this.request(
      "POST",
      `v1/${p.resourceName}/members:modify`,
      compact({ resourceNamesToAdd: p.add, resourceNamesToRemove: p.remove }),
    );
  }

  // ---- Other contacts (separate read-only scope) ----

  /** Lists "Other contacts" — auto-saved addresses outside the saved contact list. */
  async listOtherContacts(p: ListOtherContactsParams = {}): Promise<unknown> {
    return this.request(
      "GET",
      "v1/otherContacts",
      undefined,
      compact({
        readMask: this.mask(p.readMask, DEFAULT_OTHER_CONTACT_FIELDS),
        pageSize: p.pageSize,
        pageToken: p.pageToken,
        requestSyncToken: p.requestSyncToken,
        syncToken: p.syncToken,
      }),
    );
  }

  /** Searches "Other contacts", with the same once-per-session warmup as searchContacts. */
  async searchOtherContacts(p: SearchParams): Promise<unknown> {
    const readMask = this.mask(p.readMask, DEFAULT_OTHER_CONTACT_FIELDS);
    await this.warmupSearch("v1/otherContacts:search", readMask);
    return this.request(
      "GET",
      "v1/otherContacts:search",
      undefined,
      compact({ query: p.query, readMask, pageSize: p.pageSize }),
    );
  }

  /** Copies one "Other contact" into My Contacts — their only write operation. */
  async copyOtherContact(p: {
    resourceName: string;
    copyMask?: string[];
    readMask?: string[];
  }): Promise<unknown> {
    assertResourceName(p.resourceName, "otherContacts");
    return this.request("POST", `v1/${p.resourceName}:copyOtherContactToMyContactsGroup`, {
      copyMask: this.mask(p.copyMask, DEFAULT_OTHER_CONTACT_FIELDS),
      readMask: this.mask(p.readMask),
    });
  }
}

/** Drops keys whose value is `undefined` so they are not sent to the API. */
function compact<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
