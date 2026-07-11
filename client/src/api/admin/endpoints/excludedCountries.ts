import { authedFetch } from "../../utils";
import { updateSiteConfig } from "./sites";

export interface ExcludedCountriesResponse {
  success: boolean;
  excludedCountries: string[];
  error?: string;
}

export interface UpdateExcludedCountriesRequest {
  siteId: number;
  excludedCountries: string[];
}

export interface UpdateExcludedCountriesResponse {
  success: boolean;
  message: string;
  excludedCountries: string[];
  error?: string;
  details?: string[];
}

export const fetchExcludedCountries = async (siteId: number): Promise<ExcludedCountriesResponse> => {
  return await authedFetch<ExcludedCountriesResponse>(`/sites/${siteId}/excluded-countries`);
};

export const updateExcludedCountries = async (
  siteId: number,
  excludedCountries: string[]
): Promise<UpdateExcludedCountriesResponse> => {
  try {
    await updateSiteConfig(siteId, { excludedCountries });
    return {
      success: true,
      message: "Wykluczone kraje zostały zaktualizowane",
      excludedCountries: excludedCountries,
    };
  } catch (error) {
    throw new Error(
      `Nie udało się zaktualizować wykluczonych krajów: ${error instanceof Error ? error.message : "Nieznany błąd"}`
    );
  }
};
