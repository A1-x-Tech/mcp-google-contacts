import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { ContactFields } from "../types.js";

/**
 * Every field name the People API accepts in personFields/readMask. Person
 * masks are validated against this closed set so a typo fails at the schema,
 * not as an opaque 400 from Google.
 */
const PERSON_FIELD_NAMES = [
  "addresses",
  "ageRanges",
  "biographies",
  "birthdays",
  "calendarUrls",
  "clientData",
  "coverPhotos",
  "emailAddresses",
  "events",
  "externalIds",
  "genders",
  "imClients",
  "interests",
  "locales",
  "locations",
  "memberships",
  "metadata",
  "miscKeywords",
  "names",
  "nicknames",
  "occupations",
  "organizations",
  "phoneNumbers",
  "photos",
  "relations",
  "sipAddresses",
  "skills",
  "urls",
  "userDefined",
] as const;

/** The only fields that exist on "Other contacts". */
const OTHER_CONTACT_FIELD_NAMES = ["names", "emailAddresses", "phoneNumbers", "photos", "metadata"] as const;

/** The fields copyOtherContactToMyContactsGroup can carry over. */
const COPY_MASK_NAMES = ["names", "emailAddresses", "phoneNumbers"] as const;

/** The fields a ContactGroup exposes via groupFields. */
const GROUP_FIELD_NAMES = ["name", "groupType", "memberCount", "metadata", "clientData"] as const;

/**
 * Schema factories, not shared consts: reusing one zod object across two fields
 * makes zod-to-json-schema dedupe them into a `$ref`, which some tool-schema
 * consumers (OpenAI Apps review) don't dereference and flag as `any`. A fresh
 * object per field keeps each one inlined with its type + pattern.
 */
export const personResourceNameSchema = () =>
  z
    .string()
    .regex(/^people\/[a-zA-Z0-9_-]+$/, 'Must look like "people/<id>"')
    .describe(
      'The contact\'s full resource name, e.g. "people/c1234567890" — exactly as returned by list_contacts, search_contacts or create_contact.',
    );

export const groupResourceNameSchema = () =>
  z
    .string()
    .regex(/^contactGroups\/[a-zA-Z0-9_-]+$/, 'Must look like "contactGroups/<id>"')
    .describe('The group\'s full resource name, e.g. "contactGroups/12abc34d567" — from list_contact_groups.');

export const otherContactResourceNameSchema = () =>
  z
    .string()
    .regex(/^otherContacts\/[a-zA-Z0-9_-]+$/, 'Must look like "otherContacts/<id>"')
    .describe('The Other-contact\'s full resource name, e.g. "otherContacts/c123" — from list_other_contacts.');

/** A person-fields mask: which Person fields the API should return. */
export const personFieldsSchema = () =>
  z
    .array(z.enum(PERSON_FIELD_NAMES))
    .min(1)
    .describe(
      "Person fields to return (default names, emailAddresses, phoneNumbers, organizations, memberships). Only masked fields come back — an absent field may be unmasked, not empty.",
    );

/** The restricted mask for Other-contacts reads. */
export const otherContactFieldsSchema = () =>
  z
    .array(z.enum(OTHER_CONTACT_FIELD_NAMES))
    .min(1)
    .describe("Fields to return (default names, emailAddresses, phoneNumbers) — Other contacts have no more.");

/** Which fields copy_other_contact carries into the new saved contact. */
export const copyMaskSchema = () =>
  z
    .array(z.enum(COPY_MASK_NAMES))
    .min(1)
    .describe("Fields to copy into the new saved contact (default all three).");

/** A group-fields mask for contact-group reads. */
export const groupFieldsSchema = () =>
  z
    .array(z.enum(GROUP_FIELD_NAMES))
    .min(1)
    .describe("Group fields to return (default metadata, groupType, memberCount, name).");

/**
 * The shape of one normalized contact — shared by create_contact,
 * update_contact and the batch tools. A factory that builds fresh schemas per
 * call for the same `$ref`-dedup reason as above.
 */
export const contactFieldsShape = () => ({
  given_name: z.string().optional().describe("First name."),
  middle_name: z.string().optional().describe("Middle name."),
  family_name: z.string().optional().describe("Last name."),
  prefix: z.string().optional().describe('Honorific prefix, e.g. "Dr.".'),
  suffix: z.string().optional().describe('Honorific suffix, e.g. "Jr.".'),
  nickname: z.string().optional().describe('Nickname. On update "" clears it.'),
  emails: z
    .array(
      z.object({
        value: z.string().min(1).describe("The email address."),
        type: z.string().optional().describe('Label, e.g. "home", "work", "other".'),
      }),
    )
    .optional()
    .describe("Email addresses. On update this list replaces ALL existing emails; [] clears them."),
  phones: z
    .array(
      z.object({
        value: z.string().min(1).describe("The phone number (any human-readable format)."),
        type: z.string().optional().describe('Label, e.g. "mobile", "home", "work".'),
      }),
    )
    .optional()
    .describe("Phone numbers. On update this list replaces ALL existing phones; [] clears them."),
  addresses: z
    .array(
      z.object({
        street: z.string().optional().describe("Street address line."),
        city: z.string().optional(),
        region: z.string().optional().describe("State / province / region."),
        postal_code: z.string().optional(),
        country: z.string().optional(),
        type: z.string().optional().describe('Label, e.g. "home", "work".'),
      }),
    )
    .optional()
    .describe("Postal addresses. On update this list replaces ALL existing addresses; [] clears them."),
  organization: z
    .object({
      name: z.string().optional().describe("Company / organization name."),
      title: z.string().optional().describe("Job title."),
      department: z.string().optional(),
    })
    .optional()
    .describe("Employer info. On update it replaces the existing organizations; {} clears them."),
  birthday: z
    .string()
    .regex(/^((\d{4}-)?\d{1,2}-\d{1,2})?$/, 'Must be "YYYY-MM-DD", "MM-DD", or "" to clear')
    .optional()
    .describe('Birthday: "YYYY-MM-DD", or "MM-DD" for a year-less birthday. On update "" clears it.'),
  notes: z
    .string()
    .optional()
    .describe('Free-text notes (the "Notes" field in Google Contacts). On update "" clears it.'),
  urls: z
    .array(
      z.object({
        value: z.string().min(1).describe("The URL."),
        type: z.string().optional().describe('Label, e.g. "homePage", "work", "blog".'),
      }),
    )
    .optional()
    .describe("Websites. On update this list replaces ALL existing urls; [] clears them."),
});

/**
 * Maps the snake_case tool arguments to the client's normalized ContactFields.
 * Pure key renaming — no wire knowledge (that lives in client.buildPerson) and
 * no defaults: absent keys stay absent, and an explicit empty list survives as
 * the "clear this group" signal.
 */
export function toContactFields(args: Record<string, unknown>): ContactFields {
  const a = args as {
    given_name?: string;
    middle_name?: string;
    family_name?: string;
    prefix?: string;
    suffix?: string;
    nickname?: string;
    emails?: { value: string; type?: string }[];
    phones?: { value: string; type?: string }[];
    addresses?: {
      street?: string;
      city?: string;
      region?: string;
      postal_code?: string;
      country?: string;
      type?: string;
    }[];
    organization?: { name?: string; title?: string; department?: string };
    birthday?: string;
    notes?: string;
    urls?: { value: string; type?: string }[];
  };
  return {
    givenName: a.given_name,
    middleName: a.middle_name,
    familyName: a.family_name,
    prefix: a.prefix,
    suffix: a.suffix,
    nickname: a.nickname,
    emails: a.emails,
    phones: a.phones,
    addresses: a.addresses?.map((addr) => ({
      street: addr.street,
      city: addr.city,
      region: addr.region,
      postalCode: addr.postal_code,
      country: addr.country,
      type: addr.type,
    })),
    organization: a.organization,
    birthday: a.birthday,
    notes: a.notes,
    urls: a.urls,
  };
}

/** Wraps a value as a compact-JSON tool result (compact: the consumer is an LLM). */
export function ok(data: unknown): CallToolResult {
  const text = typeof data === "string" ? data : JSON.stringify(data);
  return { content: [{ type: "text", text: text ?? "null" }] };
}

export function fail(err: unknown): CallToolResult {
  let message = err instanceof Error ? err.message : String(err);
  // Surface the underlying cause (e.g. the network error behind a timeout) — no
  // secrets live in cause, and it makes failures far easier to diagnose.
  if (err instanceof Error && err.cause instanceof Error) message += ` (${err.cause.message})`;
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

/**
 * MCP tool annotations — hints the consuming client can use to gate or label a
 * tool. All four hints are set explicitly on every tool: some clients (OpenAI
 * Apps review) require readOnlyHint, destructiveHint and openWorldHint on each.
 *
 * The People API mixes reads and writes, so each tool picks one of four presets:
 * READ_ONLY (pure reads), WRITE (creates new state; replaying duplicates it),
 * UPDATE (overwrites existing fields; replaying the same update converges) and
 * DESTRUCTIVE (removes existing state; replaying hits different targets).
 */
export const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;

export const UPDATE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export const DESTRUCTIVE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
} as const;
