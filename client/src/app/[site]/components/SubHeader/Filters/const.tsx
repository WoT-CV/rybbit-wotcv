import { FilterParameter } from "@rybbit/shared";
import {
  AppWindow,
  Brain,
  Clock,
  FileText,
  Flag,
  FolderInput,
  Globe,
  Hotel,
  Languages,
  Link,
  LogIn,
  LogOut,
  MapPin,
  MapPinHouse,
  MapPinned,
  Maximize,
  Megaphone,
  MousePointerClick,
  Puzzle,
  Radio,
  Search,
  TabletSmartphone,
  Tag,
  Target,
  User,
} from "lucide-react";
import React from "react";

export const FilterOptions: {
  label: string;
  value: FilterParameter;
  icon: React.ReactNode;
}[] = [
  {
    label: "Ścieżka",
    value: "pathname",
    icon: <FolderInput className="h-4 w-4" />,
  },
  {
    label: "Tytuł strony",
    value: "page_title",
    icon: <FileText className="h-4 w-4" />,
  },
  {
    label: "Query string",
    value: "querystring",
    icon: <Search className="h-4 w-4" />,
  },
  {
    label: "Hostname",
    value: "hostname",
    icon: <Hotel className="h-4 w-4" />,
  },
  {
    label: "ID użytkownika",
    value: "user_id",
    icon: <User className="h-4 w-4" />,
  },
  {
    label: "Nazwa zdarzenia",
    value: "event_name",
    icon: <MousePointerClick className="h-4 w-4" />,
  },
  {
    label: "Odsyłacz",
    value: "referrer",
    icon: <Link className="h-4 w-4" />,
  },
  {
    label: "Kanał",
    value: "channel",
    icon: <Radio className="h-4 w-4" />,
  },
  {
    label: "Strona wejścia",
    value: "entry_page",
    icon: <LogIn className="h-4 w-4" />,
  },
  {
    label: "Strona wyjścia",
    value: "exit_page",
    icon: <LogOut className="h-4 w-4" />,
  },
  {
    label: "Kraj",
    value: "country",
    icon: <Globe className="h-4 w-4" />,
  },
  {
    label: "Region",
    value: "region",
    icon: <MapPinned className="h-4 w-4" />,
  },
  {
    label: "Miasto",
    value: "city",
    icon: <MapPinHouse className="h-4 w-4" />,
  },
  {
    label: "Typ urządzenia",
    value: "device_type",
    icon: <TabletSmartphone className="h-4 w-4" />,
  },
  {
    label: "System operacyjny",
    value: "operating_system",
    icon: <Brain className="h-4 w-4" />,
  },
  {
    label: "Wersja systemu operacyjnego",
    value: "operating_system_version",
    icon: <Brain className="h-4 w-4" />,
  },
  {
    label: "Przeglądarka",
    value: "browser",
    icon: <AppWindow className="h-4 w-4" />,
  },
  {
    label: "Wersja przeglądarki",
    value: "browser_version",
    icon: <AppWindow className="h-4 w-4" />,
  },
  {
    label: "Język",
    value: "language",
    icon: <Languages className="h-4 w-4" />,
  },
  {
    label: "Wymiary ekranu",
    value: "dimensions",
    icon: <Maximize className="h-4 w-4" />,
  },
  {
    label: "UTM Source",
    value: "utm_source",
    icon: <Target className="h-4 w-4" />,
  },
  {
    label: "UTM Medium",
    value: "utm_medium",
    icon: <Megaphone className="h-4 w-4" />,
  },
  {
    label: "UTM Campaign",
    value: "utm_campaign",
    icon: <Flag className="h-4 w-4" />,
  },
  {
    label: "UTM Content",
    value: "utm_content",
    icon: <Puzzle className="h-4 w-4" />,
  },
  {
    label: "UTM Term",
    value: "utm_term",
    icon: <Tag className="h-4 w-4" />,
  },
  {
    label: "Tag",
    value: "tag",
    icon: <Tag className="h-4 w-4" />,
  },
  {
    label: "Szerokość geogr.",
    value: "lat",
    icon: <MapPin className="h-4 w-4" />,
  },
  {
    label: "Długość geogr.",
    value: "lon",
    icon: <MapPin className="h-4 w-4" />,
  },
  {
    label: "Strefa czasowa",
    value: "timezone",
    icon: <Clock className="h-4 w-4" />,
  },
];

export const OperatorOptions = [
  { label: "Jest", value: "equals" },
  { label: "Nie jest", value: "not_equals" },
  { label: "Zawiera", value: "contains" },
  { label: "Nie zawiera", value: "not_contains" },
];

export const StringOperatorOptions = [
  { label: "Jest", value: "equals" },
  { label: "Nie jest", value: "not_equals" },
  { label: "Zawiera", value: "contains" },
  { label: "Nie zawiera", value: "not_contains" },
  { label: "Zaczyna się od", value: "starts_with" },
  { label: "Kończy się na", value: "ends_with" },
  { label: "Regex", value: "regex" },
  { label: "Jest puste", value: "is_null" },
  { label: "Nie jest puste", value: "is_not_null" },
  { label: "Większe niż", value: "greater_than" },
  { label: "Mniejsze niż", value: "less_than" },
  { label: "Większe lub równe", value: "greater_than_or_equal" },
  { label: "Mniejsze lub równe", value: "less_than_or_equal" },
];

export const NumericOperatorOptions = [
  { label: "Równa się", value: "equals" },
  { label: "Nie równa się", value: "not_equals" },
  { label: "Jest puste", value: "is_null" },
  { label: "Nie jest puste", value: "is_not_null" },
  { label: "Większe niż", value: "greater_than" },
  { label: "Mniejsze niż", value: "less_than" },
  { label: "Większe lub równe", value: "greater_than_or_equal" },
  { label: "Mniejsze lub równe", value: "less_than_or_equal" },
];

export const NUMERIC_PARAMETERS: FilterParameter[] = ["lat", "lon"];

export const isNumericParameter = (param: FilterParameter): boolean =>
  NUMERIC_PARAMETERS.includes(param);
