import axios from "axios";
import dayjs from "dayjs";
import {
  type DiavgeiaSearchParams,
  searchSchema,
} from "../modules/search/schema.js";
import type {
  DiavgeiaDecision,
  DiavgeiaSearchResponse,
  Organization,
} from "../types/diavgeia.js";

const API_BASE_URL =
  process.env.DIAVGEIA_URL || "https://diavgeia.gov.gr/luminapi/api/";

export class DiavgeiaApiClient {
  private baseUrl: string;
  private client;
  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        Accept: "application/json",
      },
    });
  }

  async searchDecisions(
    params: DiavgeiaSearchParams
  ): Promise<DiavgeiaSearchResponse> {
    try {
      try {
        searchSchema.parse(params);
      } catch (error) {
        throw new Error(
          `Σφαλμα επικαιροποίησης παραμέτρων, ${(error as Error).message}`
        );
      }

      const queryParams: Record<string, string | number> = {};

      // Don't send wildcard queries - let other filters do the work
      if (params.q && params.q !== "*" && params.q.trim() !== "")
        queryParams.term = params.q;

      if (params.ministryIdOrName) queryParams.org = params.ministryIdOrName;

      if (params.from_date)
        queryParams.from_issue_date = dayjs(params.from_date).format(
          "YYYY-MM-DD"
        );

      if (params.to_date)
        queryParams.to_issue_date = dayjs(params.to_date).format("YYYY-MM-DD");

      queryParams.page = params.page || 0;
      queryParams.size = Math.min(params.size || 500, 500);
      queryParams.sort = "relative";
      queryParams.status = "published";

      const response = await this.client.get(`${this.baseUrl}/search`, {
        params: queryParams,
      });

      if (!response.data)
        throw new Error("Μη αναμενόμενη μορφή απάντησης από το API");

      if (response.data.decisions) return response.data;

      if (response.data.results)
        return {
          decisions: response.data.results,
          total: response.data.total || response.data.results.length,
        };

      return {
        decisions: [],
        total: 0,
      };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(
          `Σφάλμα API: ${error.response.status} - ${JSON.stringify(error.response.data)}`
        );
      }

      throw new Error(
        `Αποτυχία αναζήτησης αποφάσεων από το API της Διαύγειας, ${(error as Error).message}`
      );
    }
  }

  async getDecisionByAda(ada: string): Promise<DiavgeiaDecision> {
    try {
      if (!ada || ada.trim() === "") {
        throw new Error("Απαιτείται έγκυρο ΑΔΑ");
      }

      const response = await this.client.get(
        `${this.baseUrl}/decisions/${ada}`
      );
      console.log("Diavgeia API response for getDecisionByAda:", response.data);

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(
          `Σφάλμα API: ${error.response.status} - ${error.response.statusText}`
        );
      }

      throw new Error(`Αποτυχία λήψης απόφασης με ΑΔΑ ${ada}`);
    }
  }

  async getOrganizations(): Promise<Organization[]> {
    try {
      const response = await this.client.get(
        `${this.baseUrl}/organizations.json?category=MINISTRY`
      );

      if (!response.data || !response.data.organizations) {
        throw new Error("Μη αναμενόμενη μορφή απάντησης από το API");
      }

      return response.data.organizations;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(
          `Σφάλμα API: ${error.response.status} - ${JSON.stringify(error.response.data)}`
        );
      }

      throw new Error("Αποτυχία λήψης οργανισμών από το API της Διαύγειας");
    }
  }
}
