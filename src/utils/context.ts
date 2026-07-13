import { DiavgeiaApiClient } from "../api/diavgeia.js";
import type { ResolvedDiavgeiaConfig } from "../config.js";
import {
  NO_ORGANIZATIONS_FOUND,
  NO_ORGANIZATION_DATA,
  createOrganizationContext,
} from "../prompts/feedbackToLLM.js";
import type { Organization } from "../types/diavgeia.js";
import { normalizeQuery } from "./text.js";

export class OrganizationContext {
  private static instance: OrganizationContext;
  private organizations: Organization[] = [];
  private apiClient: DiavgeiaApiClient;
  private maxOrganizations: number;
  private cacheEnabled: boolean;

  constructor(
    apiClient = new DiavgeiaApiClient(),
    config: Pick<
      ResolvedDiavgeiaConfig,
      "maxOrganizations" | "cacheEnabled"
    > = {
      maxOrganizations: 50,
      cacheEnabled: true,
    }
  ) {
    this.apiClient = apiClient;
    this.maxOrganizations = config.maxOrganizations;
    this.cacheEnabled = config.cacheEnabled;
  }

  public static getInstance(): OrganizationContext {
    if (!OrganizationContext.instance) {
      OrganizationContext.instance = new OrganizationContext();
    }
    return OrganizationContext.instance;
  }

  public async findOrganizationsByName(name: string): Promise<Organization[]> {
    try {
      const orgs = await this.getOrganizations();
      const normalizedName = name.toUpperCase().trim();

      return orgs.filter((org) =>
        org.label.toUpperCase().includes(normalizedName)
      );
    } catch (error) {
      console.error("Error finding organization by name:", error);
      return [];
    }
  }

  public async getOrganizations(): Promise<Organization[]> {
    if (!this.cacheEnabled) {
      return await this.apiClient.getOrganizations();
    }

    if (this.organizations.length === 0) {
      try {
        this.organizations = await this.apiClient.getOrganizations();
      } catch (error) {
        console.error("Failed to fetch organizations:", error);
        if (this.organizations.length > 0) {
          return this.organizations;
        }
        throw error;
      }
    }

    return this.organizations;
  }

  public async detectMinistryInQuery(query: string): Promise<Organization[]> {
    if (!query) return [];

    try {
      const organizations = await this.getOrganizations();
      const normalizedQuery = normalizeQuery(query);

      const ministryNames = organizations
        .flatMap((org) =>
          org.label
            .toUpperCase()
            .split(" ")
            .map((w) => w.replace(",", ""))
        )
        .filter((word) => word !== "ΥΠΟΥΡΓΕΙΟ" && word !== "ΚΑΙ");

      const matchingOrgNames = normalizedQuery.filter((word) =>
        ministryNames.includes(word)
      );

      const matchingOrgs = matchingOrgNames
        .map((name) =>
          organizations.find((org) => org.label.toUpperCase().includes(name))
        )
        .filter((org) => !!org);

      return matchingOrgs.length > 0 ? matchingOrgs : [];
    } catch (error) {
      console.error("Error detecting ministry in query:", error);
      return [];
    }
  }

  public async generateOrganizationContext(): Promise<string> {
    try {
      const organizations = await this.getOrganizations();
      const topOrgs = organizations.slice(0, this.maxOrganizations);

      if (topOrgs.length === 0) return NO_ORGANIZATION_DATA;

      return createOrganizationContext(topOrgs, organizations.length);
    } catch (error) {
      console.error("Error generating organization context:", error);
      return NO_ORGANIZATIONS_FOUND;
    }
  }
}
