# 🛠 Available Tools

This document provides detailed information about the tools available in the Diavgeia MCP Server.

## Table of Contents

- [Search Decisions](#1-search-decisions-search-decisions)
- [Get Decision Details](#2-get-decision-details-get-decision)
- [Resources and Prompts](#-resources-and-prompts)
- [Data Source](#-data-source)

---

## 1. Search Decisions (`search-decisions`)

Search for government decisions with various filters. Returns a list of matching decisions with their metadata including ADA, subject, date, organization, and type.

### Parameters

- **`q`** (string, optional): Main search keywords - primary search term for finding relevant decisions
  - Examples: `"education"`, `"health"`, `"procurement"`
  
- **`ministryIdOrName`** (string|number, optional): Organization ID or name - automatically detected if not provided
  - Examples: `"100001274"`, `"Υπουργείο Παιδείας"`
  
- **`type`** (string, optional): Decision type identifier
  - Examples: `"Β.1.1"` (appointments), `"Β.2.1"` (budgets), `"Β.2.2"` (contracts)
  
- **`from_date`** (string, optional): Start date in YYYY-MM-DD format (default: 1 year ago)
  - Examples: `"2024-01-01"`, `"2023-06-15"`
  
- **`to_date`** (string, optional): End date in YYYY-MM-DD format (default: today)
  - Examples: `"2024-12-31"`, `"2024-06-30"`
  
- **`page`** (number, optional): Page number for pagination, starts from 0 (default: `0`)

- **`size`** (number, optional): Results per page, max 500 (default: `10`)

### Example Usage

```typescript
// Search for education-related decisions in 2024
{
  "q": "εκπαίδευση",
  "from_date": "2024-01-01",
  "to_date": "2024-12-31",
  "size": 20
}

// Search for health ministry appointments
{
  "q": "διορισμός",
  "ministryIdOrName": "Υπουργείο Υγείας",
  "type": "Β.1.1",
  "from_date": "2024-01-01"
}
```

### Response Format

```
SEARCH RESULTS: 15 decisions found

- ADA: ΨΧ465Κ8Ω-123
  Subject: Διορισμός υπαλλήλων
  Date: 2024-06-15
  Organization: Υπουργείο Παιδείας
  Type: Β.1.1 - Διορισμοί
  URL: https://diavgeia.gov.gr/decision/view/ΨΧ465Κ8Ω-123
...
```

---

## 2. Get Decision Details (`get-decision`)

Retrieve comprehensive detailed information about a specific government decision using its ADA (unique identifier). Returns full decision metadata including subject, protocol number, issue date, organization, signers, extra fields, and PDF content when available.

### Parameters

- **`ada`** (string, required): The ADA (unique identifier) of the decision
  - Format: Alphanumeric string (e.g., `"ΨΧ465Κ8Ω-123"`)

### Example Usage

```typescript
// Get details for a specific decision
{
  "ada": "ΨΧ465Κ8Ω-123"
}
```

### Response Includes

- Decision subject and protocol number
- Issue date and organization details
- Decision type and status
- Signer information (names, titles, positions)
- Document URLs and PDF content (first 1000 characters)
- Extra metadata fields

---

## 📚 Resources and Prompts

### Prompts

- **Search Examples** (`diavgeia-search-examples`): Example queries and best practices for searching Diavgeia decisions effectively

---

## 📊 Data Source

This MCP server interfaces with the official [Diavgeia API](https://diavgeia.gov.gr/api/help), which provides access to:

- Government decisions and announcements
- Public procurement information
- Organizational charts and appointments
- Budget allocations and expenditures
- Regulatory texts and legislation

All data is sourced directly from the Greek government's transparency platform, ensuring accuracy and official status.

---

## Common Decision Types

Here are some common decision types you can filter by:

| Code | Description (Greek) | Description (English) |
|------|---------------------|----------------------|
| Β.1.1 | Διορισμοί | Appointments |
| Β.2.1 | Προϋπολογισμοί | Budgets |
| Β.2.2 | Δημόσιες Συμβάσεις | Public Contracts |
| Β.2.3 | Πρόσληψη Προσωπικού | Staff Recruitment |
| Β.3.1 | Κανονιστικές Πράξεις | Regulatory Acts |

For a complete list of decision types, use the `diavgeia-api-docs` resource.

---

## Tips for Effective Searching

### 1. Use Date Ranges
Always specify date ranges to narrow down your search:
```typescript
{
  "q": "διαγωνισμός",
  "from_date": "2024-01-01",
  "to_date": "2024-03-31"
}
```

### 2. Combine Filters
Combine multiple filters for precise results:
```typescript
{
  "q": "προμήθεια",
  "ministryIdOrName": "Υπουργείο Υγείας",
  "type": "Β.2.2",
  "from_date": "2024-01-01"
}
```

### 3. Use Pagination
For large result sets, use pagination:
```typescript
{
  "q": "εκπαίδευση",
  "page": 0,
  "size": 50
}
```

### 4. Search in Greek or English
The search accepts both Greek and English keywords:
- Greek: `"εκπαίδευση"`, `"υγεία"`, `"οικονομία"`
- English: `"education"`, `"health"`, `"economy"`

---

## Error Handling

### Common Errors

**Missing ADA:**
```
ERROR: Missing required parameter 'ada'
Please provide the ADA (unique identifier) of the decision.
```

**Decision Not Found:**
```
ERROR: Decision with ADA 'ΨΧ465Κ8Ω-123' not found
Please verify the ADA and try again.
```

**Invalid Date Format:**
```
ERROR: Invalid date format
Please use YYYY-MM-DD format (e.g., '2024-01-01')
```

---

For more information, see:
- [Configuration Guide](../README.md#-configuration)
- [API Documentation](https://diavgeia.gov.gr/api/help)
- [Contributing Guidelines](../CONTRIBUTING.md)
