# Diavgeia MCP Server

[![smithery badge](https://smithery.ai/badge/michalis.koutridis/diavgeia-mcp)](https://smithery.ai/servers/michalis.koutridis/diavgeia-mcp)

A Model Context Protocol (MCP) server that provides access to Greek government transparency data from the [Diavgeia platform](https://diavgeia.gov.gr/). This server enables AI assistants like Claude to search and retrieve Greek government decisions, making public administration data more accessible.

## 🌟 Features

- **Search Government Decisions**: Query decisions by keywords, date ranges, organization, and type
<video controls width="400">
  <source src="" type="video/mov" />
</video>

[MCP demo 📹](https://collection.cloudinary.com/dvyxq82nf/14ce145828a77c3312b4c4a94b3a4085)

- **Retrieve Decision Details**: Get comprehensive information about specific decisions using their ADA (unique identifier)

[MCP demo📹](https://collection.cloudinary.com/dvyxq82nf/2c240ecf9fb4d899ad81f11b5a2f4b34)

- **Date-aware Queries**: Natural language date parsing (e.g., "last year", "January 2024")
- **Organization Search**: Find decisions by ministry or government organization

## 🚀 Quick Start

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/michalisKout/diavgeia-mcp-server.git
   cd diavgeia-mcp-server
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3a. **Start development server**
   ```bash
   pnpm dev
   ```
  Your MCP server will be available at `http://localhost:8787/sse`

4a. **Use mcp inspector**
  More info: https://modelcontextprotocol.io/docs/tools/inspector

3b. **Start development server**
   ```bash
   pnpm build:local
   ```
  Run locally using stdio transport protocol:

  ```bash
  node /Users/michaliskoutridis/dev/projects/ai-agents/diavgeia-mcp-server/dist/local.js
  ```

## 🔧 Configuration

No configuration is required. The server runs with sensible defaults and can be customized with either MCP config values or environment variables.

| Option | Default | Environment variable |
| --- | --- | --- |
| `apiBaseUrl` | `https://diavgeia.gov.gr/opendata` | `DIAVGEIA_API_BASE_URL` (`DIAVGEIA_URL` is also supported) |
| `defaultPageSize` | `10` | `DIAVGEIA_DEFAULT_PAGE_SIZE` |
| `maxOrganizations` | `50` | `DIAVGEIA_MAX_ORGANIZATIONS` |
| `defaultDateRange` | `1year` | `DIAVGEIA_DEFAULT_DATE_RANGE` |
| `language` | `en` | `DIAVGEIA_LANGUAGE` |
| `timeout` | `30000` | `DIAVGEIA_TIMEOUT` |
| `cacheEnabled` | `true` | `DIAVGEIA_CACHE_ENABLED` |

See [mcp-config-schema.json](./mcp-config-schema.json) for the full configuration schema.

## 🛠 Available Tools

The Diavgeia MCP Server provides two main tools for accessing Greek government transparency data:

1. **`search-decisions`** - Search for government decisions with various filters
2. **`get-decision`** - Retrieve detailed information about a specific decision

For detailed documentation on all available tools, parameters, examples, and best practices, see **[docs/TOOLS.md](docs/TOOLS.md)**.

### Quick Examples

**Search for education decisions in 2024:**
```typescript
{
  "q": "εκπαίδευση",
  "from_date": "2024-01-01",
  "to_date": "2024-12-31"
}
```

**Get details for a specific decision:**
```typescript
{
  "ada": "ΨΧ465Κ8Ω-123"
}
```

## 📚 Documentation

- **[Tools Reference](docs/TOOLS.md)** - Complete tools documentation
- **[Security Guide](SECURITY.md)** - Security policy and vulnerability reporting
- **[Contributing Guidelines](CONTRIBUTING.md)** - How to contribute

## 🏗 Project Structure

```
src/
├── index.ts                 # Main MCP server entry point
├── api/
│   └── diavgeia.ts         # Diavgeia API client
├── modules/
│   ├── decision/           # Decision retrieval tool
│   │   ├── constants.ts
│   │   ├── schema.ts
│   │   └── tool.ts
│   └── search/             # Decision search tool
│       ├── constants.ts
│       ├── schema.ts
│       └── tool.ts
├── types/
│   └── diavgeia.ts         # TypeScript type definitions
├── utils/                  # Utility functions
└── prompts/
    └── template.ts         # System prompts
```

## 🔧 Development

### Prerequisites

- Node.js 23+ 
- pnpm package manager

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### Quick Contribution Steps

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests and linting (`pnpm lint:fix && pnpm type-check`)
5. Commit your changes following conventional commits
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Development Setup

```bash
# Install dependencies
pnpm install

# This will automatically set up git hooks via lefthook
# The hooks will:
# - Lint and format code on pre-commit
# - Validate commit messages
# - Run checks before push
```

### Commit Message Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/). All commit messages are validated automatically.

Examples:
```bash
git commit -m "feat: add new search filter"
git commit -m "fix: resolve date parsing bug"
git commit -m "docs: update api documentation"
```

See [Commit Conventions](.github/COMMIT_CONVENTION.md) for detailed guidelines.

### Restricted: Deploying

Contributors CANNOT deploy because:
1. They don't have `CLOUDFLARE_API_TOKEN`
2. They aren't logged in as the owner
3. They don't have permissions to do so

## Setting Up Your Own Deployment

If someone wants to deploy their OWN instance:

### 1. Create Cloudflare Account
- Sign up at https://dash.cloudflare.com/sign-up
- Free tier is available

### 2. Get Your Account ID
```bash
npx wrangler login
npx wrangler whoami
```

### 3. Update wrangler.jsonc (Optional)
If deploying to their own account, they should update:
```jsonc
{
  "name": "their-own-server-name",  // Change this
  // account_id will be read from their login
}
```

### 4. Deploy
```bash
npx wrangler login  // Authenticate
pnpm deploy         // Deploy to THEIR account
```

### 5a. Cloudflare AI Playground

1. Go to [Cloudflare AI Playground](https://playground.ai.cloudflare.com/)
2. Enter your deployed MCP server URL: `your-deployment.workers.dev/sse`
3. Start using the Diavgeia tools directly in the playground!

### 5b. Claude Desktop Integration

To connect this MCP server to Claude Desktop, add the following to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "diavgeia": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://your-deployment.workers.dev/sse"
      ]
    }
  }
}
```

## �📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

### Running Checks Locally

Before opening a PR, you can run checks locally:

```bash
# Type check
pnpm run check

# Lint
pnpm run lint

# Build
pnpm run build:local

```

## 🙏 Tools and APIs used

- [Diavgeia Platform](https://diavgeia.gov.gr/) - Greek Government Transparency Initiative
- [Model Context Protocol](https://modelcontextprotocol.io/) - Standard for AI tool integration
- [Cloudflare Workers](https://workers.cloudflare.com/) - Serverless deployment platform
- [Smithery](https://smithery.ai/) - Smithery mcp servers hosting

## 📬 Support

- 🐛 **Bug Reports**: [Open an issue](https://github.com/michalisKout/diavgeia-mcp-server/issues)
- 💡 **Feature Requests**: [Start a discussion](https://github.com/michalisKout/diavgeia-mcp-server/discussions)

---

Made with ❤️ for transparency in Greek governance 

## Optional private Node HTTP hosting

The existing `pnpm start` / `pnpm dev` / `pnpm deploy` commands still target
Cloudflare, and `pnpm build:local` builds the stdio entry at `dist/local.js`.
Node HTTP is an additional transport:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm build:http
pnpm start:http
```

Set `DIAVGEIA_MCP_CREDENTIAL` privately in the server environment before starting.
The HTTP entry requires it and accepts `Authorization: Bearer <credential>` on
`/mcp`. Use the same secret in the calling backend, never in browser code. No
credential value is printed by startup. `GET /health` is unauthenticated. `PORT`
defaults to `3001`; the listener binds `::` for IPv6/private networking. Origins,
when supplied, must match the request host; ordinary backend clients need no
Origin header or CORS configuration. TLS should terminate at the hosting ingress.

SDK cancellation notifications arrive on separate HTTP requests, so HTTP mode
uses bounded sessions: 64 at most, with five minutes of inactivity before expiry.
Session IDs are random and every request requires bearer authentication. A
client should call `transport.terminateSession()` then `client.close()` when done;
closing the SDK's standalone SSE connection also releases its session. A
premature tool-response disconnect cancels only that request. DELETE, idle
expiry and SIGTERM/SIGINT shut down owned work. Embedders can reduce these limits
with `startHttpServer({ port, host, token, maxSessions, sessionIdleMs })`.
One process-lifetime evidence service is shared across session servers, retaining
the 64-entry/32-MiB cache and process-wide extraction concurrency bounds.

Both HTTP entry points reject actual incoming JSON bodies over 64 KiB before
parsing. Tool input is limited to 256 object keys/array elements. All official API
JSON GETs reject responses over 4 MiB before parsing and refuse redirects;
Node also disables environment proxies. Node's Axios HTTP adapter and the
Worker's fetch adapter both enforce actual streamed response bytes. Retrieval
retains the 30-second total deadline, at most three transient GET attempts and
a two-second Retry-After cap. Arbitrary `rawQuery` expressions remain accepted,
but echoing an opaque expression cannot certify complete search coverage.

**PDF extraction differs by platform:** Node HTTP and stdio use isolated PDF
workers for native page text (15 MiB, 200 pages, two concurrent extractions,
10-second extraction deadline). The current Cloudflare runtime reports
`unsupported` extraction and preserves decision metadata and the official link;
it does not download the PDF or claim document-body evidence. Neither platform
performs OCR. Output includes at most six excerpts of 1,200 characters each.
Extraction failures preserve `found: true` when metadata was retrieved. Text
cache entries expire after five minutes; metadata is revalidated before reuse,
and metadata without a version does not enable cross-call text reuse.

For Railway, select `Dockerfile.railway` in the service's Dockerfile path setting.
Use one replica, `PORT=3001`, the private credential variable, health check path
`/health`, and the image's `node dist-http/http.js` start command. Connect clients
to the service's private DNS on port 3001 with path `/mcp`; no public domain or
TCP proxy is needed. Configure these settings in Railway; this repository adds
no Railway Config-as-Code file. The image includes the compiled PDF worker.

Validate compatibility before publishing:

```sh
pnpm lint
pnpm type-check
pnpm test
pnpm build:local
pnpm build:http
pnpm exec wrangler deploy --dry-run
```

The test suite starts local HTTP and workerd servers. The Smithery workflow keeps
its existing Worker deployment and card publishing steps and additionally checks
the HTTP build and Worker dry run. Installs in CI and Docker disable lifecycle
scripts; local contributors may explicitly install their Git hooks separately.
