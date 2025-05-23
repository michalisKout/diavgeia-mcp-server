# Diavgeia MCP Server

A Model Context Protocol (MCP) server that provides access to Greek government transparency data from the [Diavgeia platform](https://diavgeia.gov.gr/). This server enables AI assistants like Claude to search and retrieve Greek government decisions, making public administration data more accessible.

## 🌟 Features

- **Search Government Decisions**: Query decisions by keywords, date ranges, organization, and type
- **Retrieve Decision Details**: Get comprehensive information about specific decisions using their ADA (unique identifier)
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

### Configuration Options

The server supports the following configuration options via environment variables or configuration file:

```json
{
  "apiBaseUrl": "https://test3.diavgeia.gov.gr/luminapi/opendata",
  "defaultPageSize": 10,
  "maxOrganizations": 50,
  "defaultDateRange": "1year",
  "language": "en",
  "timeout": 30000,
  "cacheEnabled": true
}
```

**Configuration Parameters:**
- `apiBaseUrl`: Base URL for the Diavgeia API (default: `https://test3.diavgeia.gov.gr/luminapi/opendata`)
- `defaultPageSize`: Default number of results per page (default: `10`, max: `500`)
- `maxOrganizations`: Maximum organizations to display in context (default: `50`)
- `defaultDateRange`: Default search date range - `1month`, `3months`, `6months`, `1year`, `2years` (default: `1year`)
- `language`: Response language - `el` (Greek) or `en` (English) (default: `en`)
- `timeout`: Request timeout in milliseconds (default: `30000`)
- `cacheEnabled`: Enable organization data caching (default: `true`)

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
- **[Deployment Security](DEPLOYMENT_SECURITY.md)** - Deployment authentication guide
- **[Contributing Guidelines](CONTRIBUTING.md)** - How to contribute
- **[CI/CD Workflows](.github/WORKFLOWS.md)** - GitHub Actions documentation

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
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

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

# Format check
pnpm run format:check

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
