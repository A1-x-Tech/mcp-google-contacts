# <img src="./assets/a1-logo.svg" alt="A1" width="40"> Google Contacts MCP

**English** | [Русский](./README.ru.md)

[![npm](https://img.shields.io/npm/v/mcp-google-contacts)](https://www.npmjs.com/package/mcp-google-contacts)
[![CI](https://github.com/A1-x-Tech/mcp-google-contacts/actions/workflows/ci.yml/badge.svg)](https://github.com/A1-x-Tech/mcp-google-contacts/actions/workflows/ci.yml)
[![Glama](https://glama.ai/mcp/servers/A1-x-Tech/mcp-google-contacts/badges/score.svg)](https://glama.ai/mcp/servers/A1-x-Tech/mcp-google-contacts)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

**A1 Google Contacts MCP** lets an AI app manage your Google address book in plain language. Find a contact, create or update one, organize contacts with labels, run batch imports and clean-ups, and turn auto-saved "Other contacts" into real ones.

It uses the Google People API — the API behind Google Contacts — with your Google account. It guards every update against concurrent edits, keeps reads compact with explicit field masks and makes the limits of the People API explicit instead of implying that every contacts task is possible.

- **19 tools.** List, search and read contacts, create, update and delete them one at a time or in batches, manage contact groups and membership, and reach "Other contacts".
- **Updates don't clobber.** Every update is etag-guarded: if a contact changed elsewhere since it was read, the write fails instead of silently overwriting the concurrent edit.
- **Deletes are real.** The People API has no trash; deleting a contact or group is permanent, and the server marks those tools destructive so your AI app can ask first.
- **Minimal Google scopes.** It uses `contacts` for read/write — `contacts.readonly` is enough for a read-only setup — plus `contacts.other.readonly` only for "Other contacts", without broad account access.

Start with a read-only question:

> Find everyone from Acme in my contacts and show their emails and phone numbers.

[Connect the server](#quick-start) · [Explore use cases](#what-you-can-ask-it-to-do) · [Open technical documentation](#technical-documentation)

---

## See it work in a minute

> **You:** Show my contact card for Jane Doe — email, phone and company.
>
> **Assistant:** Finds the contact and shows the requested fields. Nothing changes.
>
> **You:** Change her phone number to +1 415 555 0100 and add her to the "Clients" label.
>
> **Assistant:** Shows the contact and the proposed change, then asks for confirmation before writing.
>
> **You:** Confirm.
>
> **Assistant:** Applies the etag-guarded update and the label. If the contact changed elsewhere in the meantime, the write fails instead of overwriting it.

## Contents

- [Quick start](#quick-start)
- [What you can ask it to do](#what-you-can-ask-it-to-do)
- [How a contact changes](#how-a-contact-changes)
- [What can change](#what-can-change)
- [Getting access](#getting-access)
- [Configuration](#configuration)
- [Data, limits and background work](#data-limits-and-background-work)
- [Technical documentation](#technical-documentation)
- [Support](#support)

## Quick start

You need Node.js 20+, a Google account and OAuth credentials from a Google Cloud project with the People API enabled.

1. [Prepare Google OAuth access](#getting-access).
2. Add the server to your AI app.
3. Ask the read-only question above.

<details open>
<summary><strong>Codex</strong></summary>

<br>

**In the app:** open **Settings → MCP servers**, select **Add server**, choose **STDIO**, enter the command `npx -y mcp-google-contacts@latest` and environment variables `GOOGLE_CONTACTS_CLIENT_ID`, `GOOGLE_CONTACTS_CLIENT_SECRET`, `GOOGLE_CONTACTS_REFRESH_TOKEN`, then select **Save** and **Restart**.

**From the command line:**

```bash
codex mcp add google-contacts \
  --env GOOGLE_CONTACTS_CLIENT_ID=your_client_id \
  --env GOOGLE_CONTACTS_CLIENT_SECRET=your_client_secret \
  --env GOOGLE_CONTACTS_REFRESH_TOKEN=your_refresh_token \
  -- npx -y mcp-google-contacts@latest
```

```bash
codex mcp list
```

[Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)

</details>

<details>
<summary><strong>Claude Code</strong></summary>

<br>

```bash
claude mcp add \
  --env GOOGLE_CONTACTS_CLIENT_ID=your_client_id \
  --env GOOGLE_CONTACTS_CLIENT_SECRET=your_client_secret \
  --env GOOGLE_CONTACTS_REFRESH_TOKEN=your_refresh_token \
  --transport stdio --scope user google-contacts \
  -- npx -y mcp-google-contacts@latest
```

```bash
claude mcp list
```

[Claude Code MCP documentation](https://code.claude.com/docs/en/mcp)

</details>

<details>
<summary><strong>Claude Desktop</strong></summary>

<br>

The current official path is **Settings → Extensions**. For a custom desktop extension, open **Advanced settings → Extension Developer → Install Extension…**, select a `.mcpb` file and follow the prompts.

This repository currently publishes an npm stdio package and does not contain a `.mcpb` bundle. For Claude Desktop builds that still support local configuration, use the following JSON stdio configuration as a fallback:

```json
{
  "mcpServers": {
    "google-contacts": {
      "command": "npx",
      "args": ["-y", "mcp-google-contacts@latest"],
      "env": {
        "GOOGLE_CONTACTS_CLIENT_ID": "your_client_id",
        "GOOGLE_CONTACTS_CLIENT_SECRET": "your_client_secret",
        "GOOGLE_CONTACTS_REFRESH_TOKEN": "your_refresh_token"
      }
    }
  }
}
```

In those builds, save it to `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS or `%APPDATA%\Claude\claude_desktop_config.json` on Windows.

[Claude Desktop MCP documentation](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)

</details>

<details>
<summary><strong>Cursor</strong></summary>

<br>

Add this to `~/.cursor/mcp.json` on macOS/Linux or `%USERPROFILE%\.cursor\mcp.json` on Windows:

```json
{
  "mcpServers": {
    "google-contacts": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-google-contacts@latest"],
      "env": {
        "GOOGLE_CONTACTS_CLIENT_ID": "your_client_id",
        "GOOGLE_CONTACTS_CLIENT_SECRET": "your_client_secret",
        "GOOGLE_CONTACTS_REFRESH_TOKEN": "your_refresh_token"
      }
    }
  }
}
```

[Cursor MCP documentation](https://cursor.com/docs/mcp)

</details>

<details>
<summary><strong>VS Code</strong></summary>

<br>

Run **MCP: Open User Configuration** and add:

```json
{
  "servers": {
    "google-contacts": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-google-contacts@latest"],
      "env": {
        "GOOGLE_CONTACTS_CLIENT_ID": "${input:contacts_client_id}",
        "GOOGLE_CONTACTS_CLIENT_SECRET": "${input:contacts_client_secret}",
        "GOOGLE_CONTACTS_REFRESH_TOKEN": "${input:contacts_refresh_token}"
      }
    }
  },
  "inputs": [
    { "type": "promptString", "id": "contacts_client_id", "description": "Google OAuth client ID" },
    { "type": "promptString", "id": "contacts_client_secret", "description": "Google OAuth client secret", "password": true },
    { "type": "promptString", "id": "contacts_refresh_token", "description": "Google OAuth refresh token", "password": true }
  ]
}
```

Check it with **MCP: List Servers**.

[VS Code MCP documentation](https://code.visualstudio.com/docs/agent-customization/mcp-servers)

</details>

## What you can ask it to do

### Find and inspect contacts

- Find everyone from Acme and show their emails and phone numbers.
- Show who is in the "Clients" label.
- List the contacts that changed since the last sync.

### Keep the address book up to date

- Create a contact for Jane Doe with her email, phone and company.
- Update a contact's phone number or job title.
- Import fifty people in one batch, or delete outdated contacts in one call.

### Organize with labels

- Create a "Clients" label and add these contacts to it.
- Rename a label, or move a contact from one label to another.
- Delete a label without deleting its contacts — or with them, but only when asked explicitly.

### Work with "Other contacts"

- Show the addresses Google saved automatically that are not in my contacts.
- Copy one of them into My Contacts as a real contact.

## How a contact changes

1. Every contact, group and Other contact has a full **resource name** (`people/c...`, `contactGroups/...`, `otherContacts/...`); tools address records by it, exactly as the API returns it.
2. Reads return only the fields named in the **field mask** (default: names, emails, phones, organizations, group memberships). An absent field may simply be outside the mask, not empty.
3. An update **replaces** each provided field group as a whole and is guarded by an **etag**: if the contact changed elsewhere since it was read, the write fails instead of overwriting the concurrent edit.
4. Deletes are permanent. The People API has no trash and no undo.

Search covers a cache that can lag recent writes by a few seconds and returns at most 30 results. "Other contacts" — addresses Google saves automatically — can only be read or copied into My Contacts, not edited in place. Contact photos have no dedicated tool; `raw_request` reaches those endpoints.

## What can change

| Operation | What happens | Confirmation boundary |
|---|---|---|
| Read, search or batch-read contacts and groups | Reads contact data | No change |
| Create a contact, a group or a batch of contacts | Adds records | Changes Google Contacts |
| Update a contact or rename a group | Replaces the provided field groups, etag-guarded | Changes a contact |
| Change label membership | Adds or removes a label on chosen contacts | Changes contacts |
| Copy an Other contact | Adds a real contact to My Contacts | Changes Google Contacts |
| Delete a contact, a group or a batch | Removes records permanently; deleting a group deletes its member contacts only when explicitly requested | Destructive |
| Raw API request | Can call API methods without a dedicated tool | Potentially destructive |

The AI client controls confirmation prompts. The server marks reads, writes and destructive tools so the client can distinguish an inspection from a live change.

## Getting access

Google Contacts requires OAuth 2.0; an API key is not enough.

1. Create or select a Google Cloud project and enable **People API**.
2. Configure the OAuth consent screen and create a **Desktop app** OAuth client.
3. Authorize the Google account whose contacts you want to manage. The [OAuth 2.0 Playground](https://developers.google.com/oauthplayground) can obtain the refresh token when **Use your own OAuth credentials** is enabled.
4. Request the minimal scopes for what you use:

   ```text
   https://www.googleapis.com/auth/contacts
   https://www.googleapis.com/auth/contacts.other.readonly
   ```

`contacts` covers reading and writing contacts and groups; for a read-only setup `contacts.readonly` alone is enough. `contacts.other.readonly` is needed only by the "Other contacts" tools. A `403` on a single tool usually means the refresh token was minted without the scope that tool needs — re-consent with the missing scope added.

Testing-mode OAuth refresh tokens can expire after seven days. Publish the OAuth app, or use an Internal app in a Workspace domain, when you need long-lived access. Treat the client secret and refresh token as passwords.

## Configuration

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_CONTACTS_CLIENT_ID` | Yes* | OAuth client ID. |
| `GOOGLE_CONTACTS_CLIENT_SECRET` | Yes* | OAuth client secret. |
| `GOOGLE_CONTACTS_REFRESH_TOKEN` | Yes* | OAuth refresh token. |
| `GOOGLE_CONTACTS_ACCESS_TOKEN` | Yes* | Short-lived alternative to the OAuth trio (~1 h). |
| `GOOGLE_CONTACTS_API_BASE` | No | Google People API base URL override. |
| `GOOGLE_CONTACTS_TIMEOUT_MS` | No | Per-request timeout; default `60000` ms. |
| `GOOGLE_CONTACTS_MAX_RETRIES` | No | Temporary-error retries; default `3`. |

\* Provide either the OAuth trio or an access token. With no credentials at all the server still starts and completes the MCP handshake; the first tool call then names the exact variables to set.

## Data, limits and background work

- **Requests go to Google.** The local server refreshes Google OAuth tokens and calls the People API at `people.googleapis.com`. Its anonymous telemetry contains an installation ID, package version, AI client and platform versions, and tool names — never OAuth tokens, contact data, tool arguments or prompts. Set `ASKADS_TELEMETRY=0` to opt out.
- **Google quotas are per-user and low.** The default People API quota allows roughly 90 reads and 90 writes per user per minute, so the batch tools beat loops of single calls; mutating batches must run one at a time. On `429` the server backs off and retries; reads also retry after network and `5xx` errors, while writes are not replayed after an uncertain failure.
- **There is no background polling.** The server runs only when called. `list_contacts` supports sync tokens, so an AI app with scheduled tasks can periodically fetch only what changed; a sync token expires after about seven days, after which a full re-list is needed.

## Technical documentation

- [MCP capability catalog](./docs/capabilities/index.md) — task-oriented pages for every tool.
- [All tools and inputs](./docs/TOOLS.md)
- [Development documentation](./docs/DEVELOPMENT.md)
- [Publishing documentation](./docs/PUBLISHING.md)
- [Google People API reference](https://developers.google.com/people)

## Support

Found a bug or need a scenario? [Create an issue](https://github.com/A1-x-Tech/mcp-google-contacts/issues) or write in [Telegram](https://t.me/a1_mcp).

<br>

<p align="center">
  <img src="https://github.com/ztemerbekov/a1-yandex-kit-skills/raw/main/assets/images/mona-hifive-yandex-kit-warm.gif" alt="Две Моны дают пять" width="256">
</p>

<p align="center">
  You made it to the end!
</p>
