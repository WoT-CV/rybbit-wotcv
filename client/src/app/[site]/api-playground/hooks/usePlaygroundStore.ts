import { Filter, FilterParameter, FilterType } from "@rybbit/shared";
import { DateTime } from "luxon";
import { create } from "zustand";
import { EndpointConfig } from "../utils/endpointConfig";

interface PlaygroundFilter {
  parameter: FilterParameter;
  operator: FilterType;
  value: string;
}

interface PlaygroundState {
  // Selected endpoint
  selectedEndpoint: EndpointConfig | null;
  setSelectedEndpoint: (endpoint: EndpointConfig | null) => void;

  // Common parameters (independent from store.ts)
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  timeZone: string;
  setStartDate: (date: string) => void;
  setEndDate: (date: string) => void;
  setStartTime: (time: string) => void;
  setEndTime: (time: string) => void;
  setTimeZone: (tz: string) => void;

  // Filters
  filters: PlaygroundFilter[];
  addFilter: () => void;
  updateFilter: (index: number, filter: PlaygroundFilter) => void;
  removeFilter: (index: number) => void;
  clearFilters: () => void;

  // Convert playground filters to API format
  getApiFilters: () => Filter[];

  // Endpoint-specific params (dynamic)
  endpointParams: Record<string, string>;
  setEndpointParam: (key: string, value: string) => void;
  clearEndpointParams: () => void;

  // Path params (e.g., sessionId, goalId)
  pathParams: Record<string, string>;
  setPathParam: (key: string, value: string) => void;
  clearPathParams: () => void;

  // Request body for POST/PUT
  requestBody: string;
  setRequestBody: (body: string) => void;

  // Response state
  response: any;
  responseError: string | null;
  isLoading: boolean;
  responseTime: number | null;
  setResponse: (response: any, time: number) => void;
  setResponseError: (error: string) => void;
  setIsLoading: (loading: boolean) => void;
  clearResponse: () => void;

  // Reset all state
  reset: () => void;
}

// Get browser timezone or default to UTC
const getDefaultTimezone = () => {
  if (typeof window !== "undefined") {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  return "UTC";
};

// Get today's date in YYYY-MM-DD format
const getToday = () => DateTime.now().toISODate() ?? "";

export const usePlaygroundStore = create<PlaygroundState>((set, get) => ({
  // Selected endpoint
  selectedEndpoint: null,
  setSelectedEndpoint: endpoint =>
    set({
      selectedEndpoint: endpoint,
      endpointParams: {},
      pathParams: {},
      requestBody: endpoint?.requestBodyExample ? JSON.stringify(endpoint.requestBodyExample, null, 2) : "",
      response: null,
      responseError: null,
      responseTime: null,
    }),

  // Common parameters
  startDate: getToday(),
  endDate: getToday(),
  startTime: "",
  endTime: "",
  timeZone: getDefaultTimezone(),
  setStartDate: date => set({ startDate: date }),
  setEndDate: date => set({ endDate: date }),
  setStartTime: time => set({ startTime: time }),
  setEndTime: time => set({ endTime: time }),
  setTimeZone: tz => set({ timeZone: tz }),

  // Filters
  filters: [],
  addFilter: () =>
    set(state => ({
      filters: [...state.filters, { parameter: "country", operator: "equals", value: "" }],
    })),
  updateFilter: (index, filter) =>
    set(state => ({
      filters: state.filters.map((f, i) => (i === index ? filter : f)),
    })),
  removeFilter: index =>
    set(state => ({
      filters: state.filters.filter((_, i) => i !== index),
    })),
  clearFilters: () => set({ filters: [] }),

  getApiFilters: () => {
    const { filters } = get();
    return filters
      .filter(f => f.operator === "is_null" || f.operator === "is_not_null" || f.value.trim() !== "")
      .map(f => ({
        parameter: f.parameter,
        type: f.operator,
        value: f.operator === "is_null" || f.operator === "is_not_null" ? [] : ([f.value] as (string | number)[]),
      }));
  },

  // Endpoint params
  endpointParams: {},
  setEndpointParam: (key, value) =>
    set(state => ({
      endpointParams: { ...state.endpointParams, [key]: value },
    })),
  clearEndpointParams: () => set({ endpointParams: {} }),

  // Path params
  pathParams: {},
  setPathParam: (key, value) =>
    set(state => ({
      pathParams: { ...state.pathParams, [key]: value },
    })),
  clearPathParams: () => set({ pathParams: {} }),

  // Request body
  requestBody: "",
  setRequestBody: body => set({ requestBody: body }),

  // Response
  response: null,
  responseError: null,
  isLoading: false,
  responseTime: null,
  setResponse: (response, time) =>
    set({
      response,
      responseTime: time,
      responseError: null,
      isLoading: false,
    }),
  setResponseError: error =>
    set({
      responseError: error,
      response: null,
      isLoading: false,
    }),
  setIsLoading: loading => set({ isLoading: loading }),
  clearResponse: () => set({ response: null, responseError: null, responseTime: null }),

  // Reset
  reset: () =>
    set({
      selectedEndpoint: null,
      startDate: getToday(),
      endDate: getToday(),
      startTime: "",
      endTime: "",
      timeZone: getDefaultTimezone(),
      filters: [],
      endpointParams: {},
      pathParams: {},
      requestBody: "",
      response: null,
      responseError: null,
      isLoading: false,
      responseTime: null,
    }),
}));

// Filter parameter options (hardcoded, no dynamic fetching)
export const filterParameters = [
  { value: "pathname", label: "Ścieżka" },
  { value: "page_title", label: "Tytuł strony" },
  { value: "querystring", label: "Query string" },
  { value: "hostname", label: "Hostname" },
  { value: "user_id", label: "ID użytkownika" },
  { value: "event_name", label: "Nazwa zdarzenia" },
  { value: "referrer", label: "Odsyłacz" },
  { value: "channel", label: "Kanał" },
  { value: "entry_page", label: "Strona wejścia" },
  { value: "exit_page", label: "Strona wyjścia" },
  { value: "country", label: "Kraj" },
  { value: "region", label: "Region" },
  { value: "city", label: "Miasto" },
  { value: "device_type", label: "Typ urządzenia" },
  { value: "operating_system", label: "System operacyjny" },
  { value: "operating_system_version", label: "Wersja systemu operacyjnego" },
  { value: "browser", label: "Przeglądarka" },
  { value: "browser_version", label: "Wersja przeglądarki" },
  { value: "language", label: "Język" },
  { value: "dimensions", label: "Wymiary ekranu" },
  { value: "utm_source", label: "UTM Source" },
  { value: "utm_medium", label: "UTM Medium" },
  { value: "utm_campaign", label: "UTM Campaign" },
  { value: "utm_term", label: "UTM Term" },
  { value: "utm_content", label: "UTM Content" },
  { value: "tag", label: "Tag" },
  { value: "lat", label: "Szerokość geogr." },
  { value: "lon", label: "Długość geogr." },
  { value: "timezone", label: "Strefa czasowa" },
] satisfies { value: FilterParameter; label: string }[];

export const filterOperators = [
  { value: "equals", label: "Równa się" },
  { value: "not_equals", label: "Nie równa się" },
  { value: "contains", label: "Zawiera" },
  { value: "not_contains", label: "Nie zawiera" },
  { value: "starts_with", label: "Zaczyna się od" },
  { value: "ends_with", label: "Kończy się na" },
  { value: "regex", label: "Regex" },
  { value: "not_regex", label: "Nie pasuje do regex" },
  { value: "is_null", label: "Jest puste" },
  { value: "is_not_null", label: "Nie jest puste" },
  { value: "greater_than", label: "Większe niż" },
  { value: "less_than", label: "Mniejsze niż" },
  { value: "greater_than_or_equal", label: "Większe lub równe" },
  { value: "less_than_or_equal", label: "Mniejsze lub równe" },
] satisfies { value: FilterType; label: string }[];
