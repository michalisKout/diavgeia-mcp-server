# 🔒 Security Policy

## How to Report a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report security vulnerabilities by email to: **michalis.koutridis@gmail.com**

You should receive a response within 48-72 hours. If for some reason you do not receive a response within that time, please follow up via email to ensure we received your original message.

### What to Include

Please include the requested information listed below (as much as you can provide) to help us better understand the nature and scope of the possible issue:

* Type of issue (e.g. buffer overflow, cross-site scripting, etc.)
* Full paths of source file(s) related to the manifestation of the issue
* The location of the affected source code (tag/branch/commit or direct URL)
* Any special configuration required to reproduce the issue
* Step-by-step instructions to reproduce the issue
* Proof-of-concept or exploit code (if possible)
* Impact of the issue, including how an attacker might exploit the issue

This information will help us triage your report more quickly.

### Security Considerations for Diavgeia MCP Server

When using this MCP server, please be aware of the following security considerations:

#### Data Privacy
- The Diavgeia platform contains public government data, but be mindful of how you use and store this information
- Avoid logging sensitive queries or responses that might contain personal information
- Be aware that government decisions may contain names and other identifying information

#### API Usage
- The server makes requests to the official Diavgeia API (diavgeia.gov.gr)
- All data comes from official government sources
- No authentication credentials are stored or transmitted beyond what's necessary for API access

#### MCP Client Security
- This server is designed to work with trusted MCP clients like Claude Desktop

