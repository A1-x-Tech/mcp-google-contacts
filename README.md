# mcp-google-contacts

MCP server for the **Google Contacts / People API v1** (TypeScript, stdio). Search, list,
create, update and delete contacts, manage contact groups and membership, run batch
operations, and reach "Other contacts" — from Claude, Cursor, Codex and any other MCP
client.

> Technical hand-off README. The full public README, marketing copy and store listings are
> the next task; see [docs/](docs/) for the complete documentation that exists today.

## Install & run

```json
{
  "mcpServers": {
    "google-contacts": {
      "command": "npx",
      "args": ["-y", "mcp-google-contacts"],
      "env": {
        "GOOGLE_CONTACTS_CLIENT_ID": "…",
        "GOOGLE_CONTACTS_CLIENT_SECRET": "…",
        "GOOGLE_CONTACTS_REFRESH_TOKEN": "…"
      }
    }
  }
}
```

Alternative for quick tests: a single short-lived `GOOGLE_CONTACTS_ACCESS_TOKEN`
(e.g. from `gcloud auth print-access-token`). Without any credentials the server still
starts and completes the MCP handshake — every tool call then explains exactly which
variables to set.

**OAuth scopes (minimal):** `https://www.googleapis.com/auth/contacts` for read/write;
`…/contacts.readonly` suffices for reads only; `…/contacts.other.readonly` additionally for
the Other-contacts tools. Details: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Tools (19)

| Domain | Tools |
|---|---|
| Contacts | `list_contacts`, `search_contacts`, `get_contact`, `batch_get_contacts`, `create_contact`, `update_contact`, `delete_contact` |
| Groups | `list_contact_groups`, `get_contact_group`, `create_contact_group`, `update_contact_group`, `delete_contact_group`, `modify_group_members` |
| Batch | `batch_create_contacts`, `batch_update_contacts`, `batch_delete_contacts` |
| Other contacts | `list_other_contacts`, `copy_other_contact` |
| Escape hatch | `raw_request` |

Every tool ships zod-validated inputs, all four MCP annotation hints and normalized Google
API errors. Reference: [docs/TOOLS.md](docs/TOOLS.md) · task-oriented catalog:
[docs/capabilities/](docs/capabilities/index.md).

## Engineering notes

- **Degraded start** — configuration problems never kill the process before the handshake.
- **Safety** — etag-guarded updates; 429 retried with backoff, 5xx/network retries for GET
  only (writes are never replayed); SSRF guard on `raw_request`; timeout covers body reads;
  one forced token re-mint on 401; no credentials or contact data in logs or errors.
- **Tests** — offline unit suite for config, client (mocked fetch incl. the OAuth flow) and
  every tool, pinned annotations, capability-docs coverage, plus a dist smoke test that
  spawns the built binary and performs a real MCP handshake. Opt-in live smoke
  (`npm run smoke -- --live`) exercises writes on disposable resources with guaranteed
  cleanup.
- **Telemetry** — anonymous usage pings (event/tool names and versions only); opt out with
  `ASKADS_TELEMETRY=0`. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Development

```bash
npm install
npm run typecheck && npm test   # the gate; offline
```

More: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) · [docs/PUBLISHING.md](docs/PUBLISHING.md)
· [CLAUDE.md](CLAUDE.md) (architecture & conventions).

## License

[MIT](LICENSE) © A1 x Tech
