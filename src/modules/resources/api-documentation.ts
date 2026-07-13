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

**Base URL:** \`https://diavgeia.gov.gr/opendata\`

---

## Endpoint 1: Search Decisions

**Purpose:** Search and filter government decisions based on multiple criteria

**HTTP Method:** GET  
**Endpoint:** \`/search\`

### Required Parameters
None - all parameters are optional, but at least one search criterion is recommended

### Optional Parameters

| Parameter | Type | Format | Description | Default | Example |
|-----------|------|--------|-------------|---------|---------|
| \`q\` | string | text/query expression | Main query. Can be free text or a fielded query like \`decisionType:"ΛΟΙΠΕΣ ΑΤΟΜΙΚΕΣ ΔΙΟΙΚΗΤΙΚΕΣ ΠΡΑΞΕΙΣ"\` | - | \`"εκπαίδευση"\` |
| \`fq\` | string[] | fielded filter expression | Repeatable filter query, e.g. \`subject:"..."\`, \`organizationUid:"100081880"\`, \`issueDate:[2024-01-01 TO 2024-12-31]\` | - | \`organizationUid:"100081880"\` |
| \`page\` | number | integer | Page number for pagination | \`0\` | \`0\`, \`1\`, \`2\` |
| \`size\` | number | integer | Results per page (max: 500) | \`10\` | \`20\`, \`50\` |
| \`sort\` | string | sort mode | Result ordering | \`relative\` | \`relative\` |

### Example Requests
\`\`\`
GET /search?q=εκπαίδευση&fq=organizationUid:"100081880"&sort=relative
GET /search?fq=subject:"Διαπίστωση λύσης σύμβασης εργασίας λόγω παραίτησης"&fq=organizationUid:"100081880"&q=decisionType:"ΛΟΙΠΕΣ ΑΤΟΜΙΚΕΣ ΔΙΟΙΚΗΤΙΚΕΣ ΠΡΑΞΕΙΣ"&page=0&sort=relative
GET /search?q=προμήθεια&fq=issueDate:[2024-01-01 TO 2024-12-31]&size=20
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
