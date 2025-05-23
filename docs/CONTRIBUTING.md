# Contributing to Diavgeia MCP Server

Thank you for your interest in contributing to the Diavgeia MCP Server! We welcome contributions from the community and are excited to see how you can help improve this project.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Submitting Changes](#submitting-changes)
- [Code Style](#code-style)
- [Testing](#testing)
- [Documentation](#documentation)

## 📜 Code of Conduct

This project follows a Code of Conduct to ensure a welcoming environment for all contributors. By participating, you are expected to uphold this code.

### Our Standards

- Use welcoming and inclusive language
- Be respectful of differing viewpoints and experiences
- Gracefully accept constructive criticism
- Show empathy towards other community members

## 🚀 Getting Started

### Prerequisites

- Node.js 23 or higher
- pnpm package manager

### Development Setup

1. **Install dependencies**
   ```bash
   pnpm install
   ```

2a. **Start development server (sse)**
   ```bash
   pnpm dev
   ```
2b. **Start development local (stdio)**
   ```bash
   pnpm run build:local
   ```

## 🔄 Making Changes

### Branch Strategy

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b bugfix/issue-description
   ```

### Types of Contributions

We welcome several types of contributions:

- 🐛 **Bug fixes**: Fix issues with existing functionality
- ✨ **New features**: Add new MCP tools or enhance existing ones
- 📚 **Documentation**: Improve README, add examples, or enhance code comments
- 🧪 **Tests**: Add or improve test coverage
- 🎨 **Code quality**: Refactoring, performance improvements, or style fixes

### Development Guidelines

#### Working with the Diavgeia API

- Always test API calls with real data from the Diavgeia platform (https://diavgeia.gov.gr/opendata)
- Handle API rate limits gracefully

#### MCP Tool Development

- Follow the existing tool structure in `src/modules/`
- Each tool should have:
  - `constants.ts` - Tool names and descriptions
  - `schema.ts` - Zod validation schemas
  - `tool.ts` - Tool implementation
- Provide both Greek and English descriptions where applicable
- Include comprehensive parameter validation

#### Date and Text Handling

- Use the existing date utilities for parsing natural language dates
- Support both Greek and English date formats
- Ensure proper encoding for Greek text
- Test with various Greek government terminology

## ✅ Submitting Changes

### Before Submitting

1. **Run quality checks**
   ```bash
   pnpm format
   pnpm lint:fix
   pnpm type-check
   ```

2. **Test your changes**
   ```bash
   # Start development server
   pnpm dev
   
   # Test with MCP client
   # Test with both Greek and English queries
   # Test error handling
   ```

3. **Update documentation**
   - Update README.md if you added new features
   - Add or update code comments

### Pull Request Process

1. **Create a descriptive PR title**
   - Example: `Add organization filtering to search tool`

2. **Fill out the PR template**
   - Describe what your changes do
   - Link related issues
   - Include testing information
   - Add screenshots if UI changes

3. **Ensure CI passes**
   - All automated checks must pass
   - Address any reviewer feedback

4. **Get approval**
   - At least one maintainer must approve
   - All conversations must be resolved
   - Always use squash and merge

## 🎨 Code Style

This project uses [Biome](https://biomejs.dev/) for consistent code formatting and linting.\


## 🧪 Testing

### Manual Testing

1. **Basic functionality**
   ```bash
   # Test search tool
   # Test decision retrieval
   # Test error handling
   ```

2. **Cross-platform testing**
   - Test on different operating systems
   - Test with different MCP clients
   - Test with various deployment methods

3. **Language testing**
   - Test with Greek queries
   - Test with English queries
   - Test date parsing in both languages
   - Verify proper text encoding

## 📚 Documentation

### Code Documentation

- Add JSDoc comments for public functions
- Explain complex logic with inline comments
- Document Greek government terminology
- Include usage examples

### User Documentation

- Update README.md for new features
- Add configuration examples
- Include troubleshooting guides
- Provide clear setup instructions

### Greek Language Considerations

- Ensure Greek text displays correctly
- Provide translations for user-facing messages
- Document Greek government terms and abbreviations
- Consider cultural context in documentation

## 🤝 Community

### Getting Help

- 💬 **Discussions**: Use GitHub Discussions for questions
- 🐛 **Issues**: Report bugs through GitHub Issues
- 📧 **Email**: Contact maintainers directly for sensitive issues

### Communication

- Be respectful and constructive in all interactions
- Provide context when asking questions
- Share knowledge and help other contributors
- Follow up on your contributions

## 🏆 Recognition

Contributors are recognized in several ways:

- Listed in the project's README.md
- Mentioned in release notes for significant contributions
- Given credit in commit messages and PR descriptions

Thank you for contributing to the Diavgeia MCP Server! Your efforts help make Greek government data more accessible to everyone.
