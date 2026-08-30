/**
 * The server talks to the Google People API v1 (https://people.googleapis.com,
 * REST over JSON) — the API behind Google Contacts. Auth is Google OAuth 2.0:
 * a Bearer access token, minted on demand from a refresh token via
 * https://oauth2.googleapis.com/token (or a static short-lived access token,
 * mostly for testing). Scopes are minimal: `contacts` for read/write,
 * `contacts.readonly` for reads only, `contacts.other.readonly` additionally
 * for the Other-contacts tools (see docs/DEVELOPMENT.md).
 */

/**
 * Sort order for list_contacts. These are the API's own readable wire values,
 * passed through unchanged (like a currency code — mapping them would only
 * obscure the vocabulary the API errors use).
 */
export type SortOrder =
  | "LAST_MODIFIED_ASCENDING"
  | "LAST_MODIFIED_DESCENDING"
  | "FIRST_NAME_ASCENDING"
  | "LAST_NAME_ASCENDING";

/** A typed value with an optional label, e.g. { value: "a@b.c", type: "work" }. */
export interface TypedValue {
  value: string;
  /** Free-form label; the UI knows home / work / other. */
  type?: string;
}

/** A structured postal address (all parts optional — the API accepts partial addresses). */
export interface AddressInput {
  street?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  type?: string;
}

/**
 * The normalized contact vocabulary shared by create_contact, update_contact
 * and the batch tools. The client maps it to the wire Person shape
 * (names[0].honorificPrefix, emailAddresses[], biographies[], ...) — tools
 * never build Person objects themselves. A field left `undefined` is not
 * touched; on update, a provided-but-empty field ([], "") clears the
 * corresponding Person field because its group enters the update mask.
 */
export interface ContactFields {
  givenName?: string;
  middleName?: string;
  familyName?: string;
  /** Honorific prefix, e.g. "Dr." */
  prefix?: string;
  /** Honorific suffix, e.g. "Jr." */
  suffix?: string;
  nickname?: string;
  emails?: TypedValue[];
  phones?: TypedValue[];
  addresses?: AddressInput[];
  organization?: { name?: string; title?: string; department?: string };
  /** "YYYY-MM-DD", or "MM-DD" for a year-less birthday. */
  birthday?: string;
  /** Free-text notes — maps to biographies[0] (contentType TEXT_PLAIN). */
  notes?: string;
  urls?: TypedValue[];
}

export interface GoogleContactsConfig {
  /** OAuth2 client id (refresh flow). */
  clientId?: string;
  /** OAuth2 client secret (refresh flow). Treated as a secret. */
  clientSecret?: string;
  /** OAuth2 refresh token, exchanged for access tokens. Treated as a secret. */
  refreshToken?: string;
  /** Static access token (short-lived, ~1h). Used only when the refresh triple is absent. Treated as a secret. */
  accessToken?: string;
  /** API root. Defaults to https://people.googleapis.com. */
  apiBase: string;
  /** Per-request timeout in milliseconds. Defaults to 60_000. */
  timeoutMs?: number;
  /** Max retries for transient errors (429 always; 5xx/network for reads). Defaults to 3. */
  maxRetries?: number;
  /** Base backoff in milliseconds, doubled each retry. Defaults to 500. */
  retryBaseMs?: number;
}

/**
 * Google APIs report failures as a non-2xx HTTP status with a JSON envelope
 * ({ error: { code, message, status, details } }); the OAuth token endpoint
 * uses { error, error_description }. The parsed body is kept alongside the
 * status and a short readable message is derived. The message never carries
 * credentials — only what Google itself wrote about the failure.
 */
export class GoogleContactsError extends Error {
  readonly status: number;
  readonly body?: unknown;

  constructor(status: number, body: unknown) {
    super(`HTTP ${status}: ${formatErrorBody(body)}`);
    this.name = "GoogleContactsError";
    this.status = status;
    this.body = body;
  }
}

/** Turns a parsed Google API error body into a short, readable message. */
function formatErrorBody(body: unknown): string {
  if (body == null) return "(no body)";
  if (typeof body === "string") return body.slice(0, 500);
  if (typeof body !== "object") return String(body);
  const obj = body as Record<string, unknown>;

  // OAuth token endpoint style: { error: "invalid_grant", error_description: "..." }
  if (typeof obj.error === "string") {
    const description = typeof obj.error_description === "string" ? `: ${obj.error_description}` : "";
    return `${obj.error}${description}`.slice(0, 500);
  }

  // Google API envelope: { error: { code, message, status, details } }
  const err = (typeof obj.error === "object" && obj.error !== null ? obj.error : obj) as Record<string, unknown>;
  if (typeof err.message === "string") {
    const status = typeof err.status === "string" ? `[${err.status}] ` : "";
    return `${status}${err.message}`.slice(0, 500);
  }

  return JSON.stringify(obj).slice(0, 500);
}
