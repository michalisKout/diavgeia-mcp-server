<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# Diavgeia MCP Server Project Instructions

This is a Model Context Protocol (MCP) server project that interfaces with the Diavgeia open government data API.

## Project Context

- This MCP server provides tools for searching and retrieving Greek government decisions from the Diavgeia platform
- The project follows ESM syntax for all imports/exports
- All code is written in TypeScript using pnpm as the package manager
- Biomejs is used for formatting and linting (prefer using double quotes, 2 spaces indentation)
- The server is designed to work with Claude for Desktop and other MCP clients

## API Reference

The Diavgeia API documentation can be found at: https://diavgeia.gov.gr/api/help

## Key Files and Directories

- `src/index.ts`: Main entry point for the MCP server
- `src/api/diavgeia.ts`: Contains the Diavgeia API client implementation
- `src/modules/**/schema.ts`: Contains zod schema implementations for related tool
- `src/modules/**/constants.ts`: Contains constants for related tool


- `src/modules/**/tool.ts`: Contains MCP tool implementation
- `src/types/`: Contains TypeScript type definitions
- `src/utils/`: Contains utility functions

## MCP SDK Resources

You can find more info and examples at:
- https://modelcontextprotocol.io/
- https://github.com/modelcontextprotocol/sdk