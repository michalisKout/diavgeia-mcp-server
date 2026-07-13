/**
 * Search parameters for the Diavgeia API
 */
export interface DiavgeiaSearchParams {
  q?: string; // Free text search query
  org?: string; // Organization ID
  type?: string; // Decision type
  from_date?: string; // Start date (format: YYYY-MM-DD)
  to_date?: string; // End date (format: YYYY-MM-DD)
  page?: number; // Page number
  size?: number; // Results per page
}

/**
 * Response structure for search results
 */
export interface DiavgeiaSearchResponse {
  total: number;
  decisions: DiavgeiaDecision[];
}

/**
 * Structure of a Diavgeia Decision
 */
export interface DiavgeiaDecision {
  ada: string; // Unique ID for the decision
  subject: string; // Subject of the decision
  protocolNumber: string; // Protocol number
  issueDate: string; // Date of issue
  organizationId: string; // Organization ID
  organizationName: string; // Organization name
  decisionTypeId: string; // Type ID
  decisionTypeName: string; // Type name
  url: string; // URL to view the decision
  documentUrl: string; // URL to the document file
  status: string; // Status of the decision
  extraFieldValues?: Record<string, unknown>; // Extra fields (depends on decision type)
  signers?: DiavgeiaSigner[]; // List of signers
}

/**
 * Signer of a decision
 */
export interface DiavgeiaSigner {
  name: string; // Signer's name
  title: string; // Signer's title
  position: string; // Signer's position
}

/**
 * Decision from the Diavgeia API
 */
export interface Decision {
  protocolNumber: string;
  subject: string;
  issueDate: number; // Unix timestamp
  organizationId: string;
  signerIds: string[];
  unitIds: string[];
  decisionTypeId: string;
  thematicCategoryIds: string[];
  extraFieldValues: Record<string, unknown>;
  privateData: boolean;
  ada: string;
  publishTimestamp: number; // Unix timestamp
  submissionTimestamp: number; // Unix timestamp
  versionId: string;
  status: string;
  url: string;
  documentUrl: string;
  documentChecksum: string | null;
  attachments: Attachment[];
  warnings: unknown | null;
  correctedVersionId: string | null;
}

export interface Info {
  query: string;
  page: number;
  size: number;
  actualSize: number;
  total: number;
  order: string;
}

export interface Data {
  decisions: Decision[];
  info: Info;
}

/**
 * Attachment for a decision
 */
export interface Attachment {
  id: string;
  description: string;
  filename: string;
  mimeType: string;
  checksum: string;
  size: number;
}

/**
 * Request for storing an attachment
 */
export interface AttachmentStoreRequest {
  description: string;
  filename: string;
  mimeType: string;
  checksum: string;
  size: number;
  data: string; // Base64 encoded data
}

/**
 * Decision revocation request
 */
export interface DecisionRevocationRequest {
  ada: string;
  versionId: string;
  revocationDecisionAda: string;
}

/**
 * Decision search result
 */
export interface DecisionSearchResult {
  decisions: Decision[];
  info: Info;
}

/**
 * Decision store request
 */
export interface DecisionStoreRequest {
  ada?: string;
  versionId?: string;
  protocolNumber: string;
  subject: string;
  issueDate: number; // Unix timestamp
  organizationId: string;
  unitIds: string[];
  signerIds: string[];
  decisionTypeId: string;
  thematicCategoryIds?: string[];
  extraFieldValues: Record<string, unknown>;
  privateData?: boolean;
  attachments?: AttachmentStoreRequest[];
  documentChecksum?: string;
  documentData?: string; // Base64 encoded data
  attachmentData?: string; // Base64 encoded data
  action?: DecisionStoreRequestAction;
}

/**
 * Action for decision store request
 */
export enum DecisionStoreRequestAction {
  SUBMIT = "SUBMIT",
  SAVE_DRAFT = "SAVE_DRAFT",
}

/**
 * Decision type
 */
export interface DecisionType {
  uid: string;
  label: string;
  parent?: string;
  allowedInRevocation: boolean;
}

/**
 * Decision type details
 */
export interface DecisionTypeDetails extends DecisionType {
  extraFields: ExtraField[];
}

/**
 * Collection of decision types
 */
export interface DecisionTypes {
  decisionTypes: DecisionType[];
}

/**
 * Decision version log
 */
export interface DecisionVersionLog {
  versionList: DecisionVersionLogEntry[];
}

/**
 * Decision version log entry
 */
export interface DecisionVersionLogEntry {
  version: string;
  status: string;
  versionId: string;
  timestamp: number; // Unix timestamp
  comment?: string;
}

/**
 * Collection of dictionaries
 */
export interface Dictionaries {
  dictionaries: Dictionary[];
}

/**
 * Dictionary
 */
export interface Dictionary {
  uid: string;
  label: string;
}

/**
 * Dictionary item
 */
export interface DictionaryItem {
  uid: string;
  label: string;
  parent?: string;
  order: number;
  active: boolean;
}

/**
 * Collection of dictionary items
 */
export interface DictionaryItems {
  items: DictionaryItem[];
}

/**
 * Error information
 */
export interface Error {
  code: string;
  message: string;
}

/**
 * Collection of errors
 */
export interface Errors {
  errors: Error[];
}

/**
 * Extra field definition
 */
export interface ExtraField {
  uid: string;
  label: string;
  type: string;
  required: boolean;
  multiple: boolean;
  validation: string;
  maxLength?: number;
  relatedDictionary?: string;
  defaultValue?: string;
  help?: string;
}

/**
 * Organization information
 */
export interface Organization {
  uid: string;
  label: string;
  abbreviation?: string;
  latinName?: string;
  status: string;
  category?: string;
  vatNumber?: string;
  fekNumber?: string;
  fekIssue?: string;
  fekYear?: string;
  odeManagerEmail?: string;
  website?: string;
  supervisorId?: string;
  supervisorLabel?: string;
  organizationDomains?: string[];
}

/**
 * Organization details
 */
export interface OrganizationDetails extends Organization {
  units?: Unit[];
  positions?: Position[];
  signers?: Signer[];
}

/**
 * Collection of organizations
 */
export interface Organizations {
  organizations: Organization[];
}

/**
 * Position in an organization
 */
export interface Position {
  uid: string;
  label: string;
  latinLabel?: string;
  organizationId: string;
}

/**
 * Collection of positions
 */
export interface Positions {
  positions: Position[];
}

/**
 * Signer information
 */
export interface Signer {
  uid: string;
  lastName: string;
  firstName: string;
  active: boolean;
  organizationId: string;
  positionId?: string;
  positionLabel?: string;
  unitId?: string;
  unitLabel?: string;
}

/**
 * Collection of signers
 */
export interface Signers {
  signers: Signer[];
}

/**
 * Term information
 */
export interface Term {
  uid: string;
  label: string;
}

/**
 * Collection of terms
 */
export interface Terms {
  terms: Term[];
}

/**
 * Unit in an organization
 */
export interface Unit {
  uid: string;
  label: string;
  latinName?: string;
  category?: string;
  parent?: string;
  active: boolean;
  organizationId: string;
}

/**
 * Collection of units
 */
export interface Units {
  units: Unit[];
}
