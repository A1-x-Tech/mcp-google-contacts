import { ConfigError, CredentialsError, loadConfig } from "./config.js";
import { GoogleContactsClient } from "./client.js";

/**
 * Live smoke checks against the real People API.
 *
 * Default mode is READ-ONLY: with a resource name (first argv or
 * GOOGLE_CONTACTS_SMOKE_RESOURCE, e.g. "people/me") it fetches that person;
 * without one it just mints an access token from the refresh token — either
 * way nothing is written.
 *
 * `npm run smoke -- --live` is the OPT-IN write scenario, touching only
 * disposable resources it creates itself: create a uniquely named contact and
 * contact group, link them, update the contact (exercising the auto-etag
 * path), verify the round-trip, then delete both. Cleanup runs in `finally` —
 * after success AND after an error — so nothing outlives the run; pre-existing
 * contacts and groups are never touched. If even a cleanup step fails, the
 * leftover resource names are printed so a human can remove them.
 */
async function readOnly(client: GoogleContactsClient): Promise<void> {
  const resource = process.argv.find((a) => a.startsWith("people/")) ?? process.env.GOOGLE_CONTACTS_SMOKE_RESOURCE;
  if (resource) {
    const person = (await client.getContact(resource, ["names", "metadata"])) as {
      resourceName?: string;
      names?: { displayName?: string }[];
    };
    console.log(
      JSON.stringify(
        { ok: true, scenario: "read", resourceName: person.resourceName, hasName: Boolean(person.names?.length) },
        null,
        2,
      ),
    );
    return;
  }
  console.log(JSON.stringify(await client.authCheck(), null, 2));
}

async function liveWrite(client: GoogleContactsClient): Promise<void> {
  const stamp = `mcp-smoke-${Date.now()}`;
  const leftovers: string[] = [];

  const created = (await client.createContact(
    {
      givenName: "MCP Smoke Test",
      familyName: stamp,
      notes: "Disposable contact created by the mcp-google-contacts live smoke — safe to delete.",
    },
    ["names"],
  )) as { resourceName?: string };
  const personName = created.resourceName;
  if (!personName) throw new Error("createContact returned no resourceName.");
  leftovers.push(personName);

  let groupName: string | undefined;
  try {
    const group = (await client.createContactGroup(stamp)) as { resourceName?: string };
    groupName = group.resourceName;
    if (!groupName) throw new Error("createContactGroup returned no resourceName.");
    leftovers.push(groupName);

    // Link, then update through the auto-etag path (no etag passed on purpose).
    await client.modifyGroupMembers({ resourceName: groupName, add: [personName] });
    await client.updateContact({ resourceName: personName, fields: { nickname: "smoke" }, personFields: ["nicknames"] });

    // Round-trip check: the contact must carry the nickname and the membership.
    const fetched = (await client.getContact(personName, ["names", "nicknames", "memberships"])) as {
      names?: { familyName?: string }[];
      nicknames?: { value?: string }[];
      memberships?: { contactGroupMembership?: { contactGroupResourceName?: string } }[];
    };
    if (fetched.names?.[0]?.familyName !== stamp) throw new Error("Round-trip failed: family name mismatch.");
    if (fetched.nicknames?.[0]?.value !== "smoke") throw new Error("Round-trip failed: nickname not applied.");
    if (!fetched.memberships?.some((m) => m.contactGroupMembership?.contactGroupResourceName === groupName)) {
      throw new Error("Round-trip failed: group membership not applied.");
    }
    console.log(JSON.stringify({ ok: true, scenario: "live", contact: personName, group: groupName }, null, 2));
  } finally {
    // Cleanup on success AND failure: the disposable resources must not survive.
    if (groupName) {
      try {
        await client.deleteContactGroup(groupName);
        leftovers.splice(leftovers.indexOf(groupName), 1);
      } catch (err) {
        console.error("cleanup: deleting the smoke group failed:", err instanceof Error ? err.message : err);
      }
    }
    try {
      await client.deleteContact(personName);
      leftovers.splice(leftovers.indexOf(personName), 1);
    } catch (err) {
      console.error("cleanup: deleting the smoke contact failed:", err instanceof Error ? err.message : err);
    }
    if (leftovers.length > 0) {
      console.error(`cleanup incomplete — delete manually: ${leftovers.join(", ")}`);
    }
  }
}

async function main(): Promise<void> {
  const client = new GoogleContactsClient(loadConfig());
  if (process.argv.includes("--live")) await liveWrite(client);
  else await readOnly(client);
}

main().catch((err) => {
  // Missing or malformed credentials are a user error, not a bug: no stack.
  const userError = err instanceof ConfigError || err instanceof CredentialsError;
  console.error("smoke failed:", userError ? err.message : err);
  process.exit(1);
});
