export const DIAVGEIA_API_RESOURCE = {
  uri: "https://diavgeia.gov.gr/api/help",
  name: "Diavgeia API Documentation",
  description:
    "Official Diavgeia API documentation including endpoints, parameters, and usage examples",
  mimeType: "text/html",
};

export const getApiDocumentation = () => `# Diavgeia API Documentation

## API Overview
The Diavgeia (Transparency) API provides programmatic access to Greek government decisions and administrative acts.

**Base URL:** \`https://test3.diavgeia.gov.gr/luminapi/opendata\`

---

## Endpoint 1: Search Decisions

**Purpose:** Search and filter government decisions based on multiple criteria

**HTTP Method:** GET  
**Endpoint:** \`/decisions/search\`

### Required Parameters
None - all parameters are optional, but at least one search criterion is recommended

### Optional Parameters

| Parameter | Type | Format | Description | Default | Example |
|-----------|------|--------|-------------|---------|---------|
| \`q\` | string | text | Search keywords for decision content | - | \`"education"\` |
| \`from_date\` | string | YYYY-MM-DD | Start date for date range filter | 1 year ago | \`"2024-01-01"\` |
| \`to_date\` | string | YYYY-MM-DD | End date for date range filter | today | \`"2024-12-31"\` |
| \`org\` | string | numeric ID | Organization/Ministry identifier | - | \`"100001274"\` |
| \`type\` | string | type code | Decision type classification | - | \`"Β.1.1"\` |
| \`page\` | number | integer | Page number for pagination | \`0\` | \`0\`, \`1\`, \`2\` |
| \`size\` | number | integer | Results per page (max: 500) | \`10\` | \`20\`, \`50\` |

### Example Requests
\`\`\`
GET /decisions/search?q=education&from_date=2024-01-01&to_date=2024-12-31&size=20
GET /decisions/search?org=100001274&type=Β.1.1&page=0&size=50
GET /decisions/search?q=procurement&from_date=2024-06-01
\`\`\`

### Response Structure
Returns JSON object with:
- \`decisions\`: Array of decision objects
- \`total\`: Total number of matching decisions
- \`page\`: Current page number
- \`size\`: Results per page

---

## Endpoint 2: Get Decision Details

**Purpose:** Retrieve comprehensive information about a specific decision

**HTTP Method:** GET  
**Endpoint:** \`/decisions/{ada}\`

### Path Parameters

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| \`ada\` | string | Yes | Unique decision identifier (ADA) | \`"6ΩΛ046ΜΠ3Ζ-4ΨΘ"\` |

### Example Requests
\`\`\`
GET /decisions/6ΩΛ046ΜΠ3Ζ-4ΨΘ
GET /decisions/ΨΧ465Κ8Ω-123
\`\`\`

### Response Structure
Returns JSON object with complete decision metadata including:
- Subject, protocol number, issue date
- Organization details
- Decision type and status
- Signer information
- Document URLs

---

## Endpoint 3: List Organizations

**Purpose:** Retrieve all registered government organizations

**HTTP Method:** GET  
**Endpoint:** \`/organizations\`

### Parameters
None

### Example Request
\`\`\`
GET /organizations
\`\`\`

### Response Structure
Returns array of organization objects with:
- \`uid\`: Unique organization identifier
- \`label\`: Organization name
- \`status\`: Active/Inactive status

---

## Decision Type Reference

Common decision type codes and their meanings:

| Code | Category | Description |
|------|----------|-------------|
| \`Β.1.1\` | Personnel | Appointments and assignments |
| \`Β.1.2\` | Personnel | Transfers and relocations |
| \`Β.2.1\` | Financial | Budget allocations and amendments |
| \`Β.2.2\` | Financial | Procurement contracts and tenders |
| \`Β.3.1\` | Legal | Regulations and legal acts |
| \`Β.4.1\` | Administrative | General administrative decisions |

**Note:** Use these codes in the \`type\` parameter to filter search results

---

## Response Format

**Content-Type:** \`application/json\`

All API responses follow a consistent JSON structure with:
- Metadata (total count, pagination info)
- Data array (decision objects)
- Status and error information (if applicable)

---

## Best Practices

1. **Pagination:** Use reasonable page sizes (10-50) for optimal performance
2. **Date Ranges:** Limit search to specific date ranges to improve response time
3. **Organization IDs:** When known, use organization IDs instead of names for precise filtering
4. **Rate Limiting:** Implement respectful rate limiting in your client applications
5. **Error Handling:** Handle HTTP error codes appropriately (404, 500, etc.)

---

## Rate Limiting

The API is provided as a public service. Please:
- Implement reasonable request throttling
- Cache responses when appropriate
- Avoid excessive concurrent requests

---

## Additional Resources

**Official Documentation:** https://diavgeia.gov.gr/api/help  
**Platform Homepage:** https://diavgeia.gov.gr/

For technical support or questions, refer to the official Diavgeia documentation.
`;
