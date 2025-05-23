export const SEARCH_EXAMPLES_PROMPT = {
  name: "diavgeia-search-examples",
  description:
    "Example queries and best practices for searching Diavgeia decisions effectively",
};

export const getSearchExamplesPrompt = () => `# Diavgeia Search Query Examples

## Overview
This guide provides practical examples and best practices for constructing effective search queries using the \`search-decisions\` tool.

---

## Basic Search Patterns

### Pattern 1: Keyword Search
**Use Case:** Find decisions containing specific keywords  
**Parameters Used:** \`q\`, \`from_date\`, \`to_date\`

\`\`\`json
{
  "q": "εκπαίδευση",
  "from_date": "2024-01-01",
  "to_date": "2024-12-31"
}
\`\`\`

**Result:** Returns all education-related decisions from 2024

---

### Pattern 2: Organization-Specific Search
**Use Case:** Find decisions from a specific ministry or organization  
**Parameters Used:** \`q\`, \`ministryIdOrName\`, \`from_date\`, \`to_date\`

\`\`\`json
{
  "q": "υγεία",
  "ministryIdOrName": "Υπουργείο Υγείας",
  "from_date": "2024-01-01",
  "to_date": "2024-12-31"
}
\`\`\`

**Alternative:** Using organization ID (more precise)
\`\`\`json
{
  "q": "υγεία",
  "ministryIdOrName": "100001274",
  "from_date": "2024-01-01"
}
\`\`\`

**Result:** Returns health-related decisions specifically from the Ministry of Health

---

### Pattern 3: Decision Type Filtering
**Use Case:** Filter by specific decision category  
**Parameters Used:** \`q\`, \`type\`, \`from_date\`

\`\`\`json
{
  "q": "διορισμός",
  "type": "Β.1.1",
  "from_date": "2024-01-01"
}
\`\`\`

**Decision Type Codes:**
- \`Β.1.1\` = Appointments and assignments
- \`Β.1.2\` = Transfers and relocations
- \`Β.2.1\` = Budget allocations
- \`Β.2.2\` = Procurement contracts
- \`Β.3.1\` = Regulations and legal acts

**Result:** Returns only appointment decisions matching the keyword

---

### Pattern 4: Paginated Results
**Use Case:** Retrieve large result sets efficiently  
**Parameters Used:** \`q\`, \`page\`, \`size\`

\`\`\`json
{
  "q": "προμήθεια",
  "page": 0,
  "size": 50
}
\`\`\`

**Next Page:**
\`\`\`json
{
  "q": "προμήθεια",
  "page": 1,
  "size": 50
}
\`\`\`

**Note:** Page numbers start from 0. Maximum size is 500.

---

## Common Use Case Examples

### Use Case A: Procurement Contracts
**Scenario:** Find all procurement contracts and tenders

\`\`\`json
{
  "q": "προμήθεια OR σύμβαση",
  "type": "Β.2.2",
  "from_date": "2024-01-01",
  "size": 30
}
\`\`\`

**Why This Works:**
- Uses OR operator for broader keyword matching
- Filters by procurement type code
- Limits to current year
- Requests 30 results for comprehensive view

---

### Use Case B: Budget Decisions
**Scenario:** Track budget allocations and amendments

\`\`\`json
{
  "q": "προϋπολογισμός",
  "type": "Β.2.1",
  "from_date": "2024-01-01",
  "to_date": "2024-12-31"
}
\`\`\`

**Why This Works:**
- Specific budget keyword
- Budget-specific type code
- Full year date range

---

### Use Case C: Hiring and Appointments
**Scenario:** Monitor personnel changes and new hires

\`\`\`json
{
  "q": "πρόσληψη OR διορισμός",
  "type": "Β.1.1",
  "from_date": "2024-01-01"
}
\`\`\`

**Why This Works:**
- Covers both hiring and appointment terms
- Personnel type code
- Open-ended date range (from 2024 onwards)

---

### Use Case D: Recent Decisions from Specific Organization
**Scenario:** Latest decisions from a particular ministry

\`\`\`json
{
  "ministryIdOrName": "Υπουργείο Παιδείας",
  "from_date": "2024-10-01",
  "to_date": "2024-10-31",
  "size": 20
}
\`\`\`

**Note:** Can omit \`q\` parameter to get all decisions from the organization

---

## Best Practices

### 1. Keyword Selection
**DO:**
- ✓ Use specific, relevant Greek keywords
- ✓ Include alternative terms with OR operator
- ✓ Use domain-specific terminology

**DON'T:**
- ✗ Use overly generic terms
- ✗ Mix unrelated keywords
- ✗ Use only English terms (Greek terms work better)

### 2. Date Range Optimization
**DO:**
- ✓ Limit searches to specific time periods
- ✓ Use recent dates for faster results
- ✓ Consider fiscal years for budget queries

**DON'T:**
- ✗ Use excessively wide date ranges (> 2 years)
- ✗ Omit dates for large result sets
- ✗ Use future dates

### 3. Organization Filtering
**DO:**
- ✓ Use organization IDs when known (most precise)
- ✓ Use full official ministry names
- ✓ Let the system auto-detect if uncertain

**DON'T:**
- ✗ Use abbreviated or informal names
- ✗ Guess organization IDs
- ✗ Mix multiple organization names in one query

### 4. Pagination Strategy
**DO:**
- ✓ Use page sizes between 10-50 for balance
- ✓ Start with page 0
- ✓ Increment page number for additional results

**DON'T:**
- ✗ Request maximum (500) unless necessary
- ✗ Skip pages randomly
- ✗ Use page sizes below 10 for efficiency

### 5. Combining Parameters
**DO:**
- ✓ Combine 2-3 parameters for precise results
- ✓ Use type codes with keywords
- ✓ Add date ranges to all searches

**DON'T:**
- ✗ Over-constrain with too many filters
- ✗ Use conflicting parameters
- ✗ Rely on single parameter only

---

## Real-World Query Examples

### Example 1: Recent Decisions from Specific Ministry

**User Request (Greek):**
> "Βρες τις 10 πιο πρόσφατες αποφάσεις του Υπουργείου Παιδείας στη Διαύγεια για το Σεπτέμβριο του 2025."

**Translation:**
> "Find the 10 most recent decisions from the Ministry of Education in Diavgeia for September 2025."

**Correct Query:**
\`\`\`json
{
  "ministryIdOrName": "Υπουργείο Παιδείας",
  "from_date": "2025-09-01",
  "to_date": "2025-09-30",
  "size": 10
}
\`\`\`

**Expected Response Format:**
- Table/list with 10 decisions
- Each decision shows: ADA, Title, Date, Type, URL
- Sorted by date (most recent first)

**Sample Result:**
\`\`\`
# Search Results

**Total**: 10 decisions found

## Decision 1
- **ADA**: 6ΓΩ246ΝΚΠΔ-2Β1
- **Subject**: Δημοσίευση στην Εφημερίδα της Κυβέρνησης...
- **Date**: 2025-09-25
- **Organization**: Υπουργείο Παιδείας
- **Type**: 2.4.7.1
- **URL**: https://diavgeia.gov.gr/decision/view/6ΓΩ246ΝΚΠΔ-2Β1

## Decision 2
- **ADA**: Ψ0ΚΝ46ΝΚΠΔ-Θ46
- **Subject**: Πρόσληψη 1 953 εκπαιδευτικών...
- **Date**: 2025-09-20
- **Organization**: Υπουργείο Παιδείας
- **Type**: 2.4.7.1
- **URL**: https://diavgeia.gov.gr/decision/view/Ψ0ΚΝ46ΝΚΠΔ-Θ46
...
\`\`\`

---

### Example 2: Get Specific Decision Details

**User Request (Greek):**
> "Βρες λεπτομέρειες για την απόφαση 6ΧΟΦ46ΝΚΠΔ-Σ5Γ"

**Translation:**
> "Find details for decision 6ΧΟΦ46ΝΚΠΔ-Σ5Γ"

**Correct Tool:** Use \`get-decision\` (not \`search-decisions\`)

**Correct Query:**
\`\`\`json
{
  "ada": "6ΧΟΦ46ΝΚΠΔ-Σ5Γ"
}
\`\`\`

**Expected Response Format:**
\`\`\`
# Decision Details

## Basic Information
- **ADA**: 6ΧΟΦ46ΝΚΠΔ-Σ5Γ
- **Subject**: Ορισμός αναπληρωτών των Διευθυντών/ντριών σε Δημοτικά Σχολεία...
- **Protocol Number**: Φ.9.3/5357
- **Issue Date**: 2025-09-12
- **Status**: PUBLISHED

## Organization
- **Name**: Υπουργείο Παιδείας
- **ID**: 100081880

## Decision Type
- **Type**: ΠΡΑΞΗ
- **Code**: 2.4.7.1

## Links
- **Decision URL**: https://diavgeia.gov.gr/decision/view/6ΧΟΦ46ΝΚΠΔ-Σ5Γ
- **Document URL**: https://diavgeia.gov.gr/doc/6ΧΟΦ46ΝΚΠΔ-Σ5Γ

## Document Content
**Excerpt** (first 1000 characters):
\`\`\`
[PDF content extracted here...]
\`\`\`
\`\`\`

---

### Example 3: Education Hiring Decisions

**User Request:**
> "Find all teacher hiring decisions from September 2025"

**Correct Query:**
\`\`\`json
{
  "q": "πρόσληψη εκπαιδευτικών",
  "ministryIdOrName": "Υπουργείο Παιδείας",
  "from_date": "2025-09-01",
  "to_date": "2025-09-30",
  "size": 20
}
\`\`\`

**Why This Works:**
- Keyword targets hiring ("πρόσληψη εκπαιδευτικών" = teacher recruitment)
- Filters by Ministry of Education
- Specific month date range
- Requests 20 results for comprehensive view

---

### Example 4: Regulations and Instructions

**User Request:**
> "Find educational guidelines issued in September 2025"

**Correct Query:**
\`\`\`json
{
  "q": "οδηγίες",
  "ministryIdOrName": "Υπουργείο Παιδείας",
  "type": "Α.3",
  "from_date": "2025-09-01",
  "to_date": "2025-09-30"
}
\`\`\`

**Why This Works:**
- "οδηγίες" = guidelines/instructions
- Type Α.3 = Regulatory/instructional acts
- Specific organization and date range

**Sample Results:**
- "Οδηγίες για τη διδασκαλία Πολιτική Παιδεία"
- "Οδηγίες για Άλγεβρα, Γεωμετρία και Μαθηματικά"

---

## Tool Selection Guide

### When to Use \`search-decisions\`
- ✓ Finding multiple decisions
- ✓ Filtering by keywords, dates, organization, type
- ✓ Exploring recent decisions
- ✓ Getting overviews

**Examples:**
- "Find decisions from..."
- "Show me recent..."
- "Search for..."
- "List all decisions about..."

### When to Use \`get-decision\`
- ✓ Getting details for a specific ADA
- ✓ Retrieving full decision information
- ✓ Extracting PDF content
- ✓ Viewing signers and extra fields

**Examples:**
- "Get details for decision 6ΧΟΦ46ΝΚΠΔ-Σ5Γ"
- "Show me the full information for ADA..."
- "What does decision XYZ say?"

---

## Response Format Best Practices

### For Search Results
Present as **structured lists** with clear sections:

\`\`\`
# Search Results

**Total**: X decisions found

## Decision 1
- **ADA**: [identifier]
- **Subject**: [title]
- **Date**: [YYYY-MM-DD]
- **Organization**: [name]
- **Type**: [code]
- **URL**: [link]
\`\`\`

### For Decision Details
Present as **hierarchical sections**:

\`\`\`
# Decision Details

## Basic Information
[Key fields]

## Organization
[Org details]

## Signers
1. [Name] - [Title] - [Position]
2. ...
\`\`\`

---

## Query Optimization Tips

| Scenario | Recommended Parameters | Typical Result Count |
|----------|----------------------|---------------------|
| Broad exploration | \`q\`, \`from_date\` | 100-1000+ |
| Targeted search | \`q\`, \`type\`, \`ministryIdOrName\`, \`from_date\` | 10-100 |
| Specific decision | \`q\` (with ADA), or use \`get-decision\` | 1 |
| Organization overview | \`ministryIdOrName\`, \`from_date\`, \`to_date\` | 50-500 |
| Recent updates | \`from_date\` (last 7-30 days), \`size: 20\` | 10-50 |

---

## Error Prevention

### Common Mistakes to Avoid

1. **Missing Date Context**
   - ❌ \`{ "q": "εκπαίδευση" }\`
   - ✅ \`{ "q": "εκπαίδευση", "from_date": "2024-01-01" }\`

2. **Invalid Type Codes**
   - ❌ \`{ "type": "appointments" }\`
   - ✅ \`{ "type": "Β.1.1" }\`

3. **Incorrect Date Format**
   - ❌ \`{ "from_date": "01/01/2024" }\`
   - ✅ \`{ "from_date": "2024-01-01" }\`

4. **Page Size Limits**
   - ❌ \`{ "size": 1000 }\`
   - ✅ \`{ "size": 50 }\` (max is 500)

---

## Quick Reference

**Essential Parameters:**
- \`q\`: Search keywords (Greek recommended)
- \`from_date\`: Start date (YYYY-MM-DD)
- \`to_date\`: End date (YYYY-MM-DD)
- \`ministryIdOrName\`: Organization filter
- \`type\`: Decision type code (e.g., Β.1.1)
- \`page\`: Page number (starts at 0)
- \`size\`: Results per page (default: 10, max: 500)

**Default Behavior:**
- If dates omitted: searches last 1 year
- If size omitted: returns 10 results
- If page omitted: returns first page (0)
`;
