// Commitlint configuration for diavgeia-mcp-server
// Extends the conventional commit format
// https://commitlint.js.org/

export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Type must be one of the following
    "type-enum": [
      2,
      "always",
      [
        "feat", // New feature
        "fix", // Bug fix
        "docs", // Documentation changes
        "style", // Code style changes (formatting, semicolons, etc.)
        "refactor", // Code refactoring
        "perf", // Performance improvements
        "test", // Adding or updating tests
        "build", // Build system or dependencies
        "ci", // CI/CD changes
        "chore", // Other changes that don't modify src or test files
        "revert", // Revert previous commit
      ],
    ],
    // Subject must not be empty
    "subject-empty": [2, "never"],
    // Subject must not end with a period
    "subject-full-stop": [2, "never", "."],
    // Subject must be in lower case
    "subject-case": [2, "always", "lower-case"],
    // Type must be in lower case
    "type-case": [2, "always", "lower-case"],
    // Header (type + subject) max length
    "header-max-length": [2, "always", 100],
    // Body max line length
    "body-max-line-length": [2, "always", 200],
    // Scope is optional
    "scope-empty": [0],
  },
};
