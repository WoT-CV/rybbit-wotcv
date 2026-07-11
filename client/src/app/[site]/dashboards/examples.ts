import type { DashboardCardDataSource, DashboardCardMapping, DashboardVizType } from "@rybbit/shared";

export type DashboardExample = {
  id: string;
  title: string;
  description: string;
  category: string;
  /** True for analyses that aren't available on the prebuilt analytics pages. */
  beyondPrebuilt?: boolean;
  dataSource?: DashboardCardDataSource;
  sql: string;
  vizType: DashboardVizType;
  mapping: DashboardCardMapping;
};

/**
 * Curated example queries shown in the card editor to help users get started.
 * All read from `scoped_events`, are auto-scoped to the global time range, and
 * use {{bucket}} for time-series granularity. Site-specific paths (e.g.
 * '/pricing') are placeholders meant to be edited.
 */
export const DASHBOARD_EXAMPLES: DashboardExample[] = [
  {
    id: "growth-accounting",
    title: "Analiza wzrostu",
    description: "Nowi, powracający, reaktywowani i uśpieni użytkownicy w kolejnych okresach.",
    category: "Retencja i wzrost",
    dataSource: "growth-accounting",
    vizType: "bar",
    mapping: {},
    sql: "",
  },
  // ── Overview ─────────────────────────────────────────────────────────────--
  {
    id: "total-pageviews-stat",
    title: "Łączna liczba odsłon",
    description: "Pojedyncza główna liczba dla wybranego zakresu.",
    category: "Przegląd",
    vizType: "stat",
    mapping: { valueColumn: "pageviews" },
    sql: `SELECT countIf(type = 'pageview') AS pageviews
FROM scoped_events`,
  },
  {
    id: "total-sessions-stat",
    title: "Łączna liczba sesji",
    description: "Pojedyncza główna liczba unikalnych sesji w wybranym zakresie.",
    category: "Przegląd",
    vizType: "stat",
    mapping: { valueColumn: "sessions" },
    sql: `SELECT countDistinct(session_id) AS sessions
FROM scoped_events`,
  },
  {
    id: "unique-users-stat",
    title: "Unikalni użytkownicy",
    description: "Anonimowe identyfikatory użytkowników widoczne w wybranym zakresie.",
    category: "Przegląd",
    vizType: "stat",
    mapping: { valueColumn: "users" },
    sql: `SELECT countDistinct(user_id) AS users
FROM scoped_events
WHERE user_id != ''`,
  },
  {
    id: "bounce-rate-stat",
    title: "Współczynnik odrzuceń",
    description: "Udział sesji z jedną odsłoną.",
    category: "Przegląd",
    vizType: "stat",
    mapping: { valueColumn: "bounce_rate", valueFormat: "percent" },
    sql: `SELECT round(100 * countIf(pages = 1) / count(), 1) AS bounce_rate
FROM (
  SELECT session_id, countIf(type = 'pageview') AS pages
  FROM scoped_events
  GROUP BY session_id
)`,
  },
  {
    id: "pages-per-session-stat",
    title: "Strony na sesję",
    description: "Średnia liczba odsłon na sesję, zgodna z KPI zaangażowania z przeglądu.",
    category: "Przegląd",
    vizType: "stat",
    mapping: { valueColumn: "pages_per_session" },
    sql: `SELECT round(avg(pages), 2) AS pages_per_session
FROM (
  SELECT session_id,
         countIf(type = 'pageview') AS pages
  FROM scoped_events
  GROUP BY session_id
)
WHERE pages > 0`,
  },
  {
    id: "avg-session-duration-stat",
    title: "Śr. czas trwania sesji",
    description: "Średnia liczba sekund między pierwszym i ostatnim zdarzeniem w sesji.",
    category: "Przegląd",
    vizType: "stat",
    mapping: { valueColumn: "avg_seconds", valueFormat: "duration" },
    sql: `SELECT round(avg(duration_seconds)) AS avg_seconds
FROM (
  SELECT session_id,
         dateDiff('second', min(timestamp), max(timestamp)) AS duration_seconds
  FROM scoped_events
  GROUP BY session_id
)`,
  },
  {
    id: "visitors-by-country-map",
    title: "Odwiedzający według kraju (mapa)",
    description: "Sesje naniesione na mapę świata.",
    category: "Przegląd",
    vizType: "map",
    mapping: { countryColumn: "country", valueColumn: "sessions" },
    sql: `SELECT country,
       countDistinct(session_id) AS sessions
FROM scoped_events
WHERE country != ''
GROUP BY country`,
  },
  {
    id: "device-type-donut",
    title: "Typ urządzenia (donut)",
    description: "Udział sesji według klasy urządzenia.",
    category: "Przegląd",
    vizType: "pie",
    mapping: { xColumn: "device_type", valueColumn: "sessions" },
    sql: `SELECT device_type,
       countDistinct(session_id) AS sessions
FROM scoped_events
WHERE device_type != ''
GROUP BY device_type
ORDER BY sessions DESC`,
  },
  {
    id: "top-pages-bar-list",
    title: "Najpopularniejsze strony (lista słupkowa)",
    description: "Najczęściej oglądane ścieżki jako lista rankingowa.",
    category: "Przegląd",
    vizType: "hbar",
    mapping: { xColumn: "pathname", valueColumn: "pageviews" },
    sql: `SELECT pathname,
       countIf(type = 'pageview') AS pageviews
FROM scoped_events
GROUP BY pathname
ORDER BY pageviews DESC
LIMIT 30`,
  },
  {
    id: "daily-pageviews-calendar",
    title: "Dzienne odsłony (kalendarz)",
    description: "Mapa aktywności dziennej. Użyj szerokiego zakresu, aby uzyskać najlepszy efekt.",
    category: "Przegląd",
    vizType: "calendar",
    mapping: { dateColumn: "day", valueColumn: "pageviews" },
    sql: `SELECT toDate(timestamp) AS day,
       countIf(type = 'pageview') AS pageviews
FROM scoped_events
GROUP BY day
ORDER BY day`,
  },

  // ── Traffic ────────────────────────────────────────────────────────────────
  {
    id: "pageviews-over-time",
    title: "Odsłony w czasie",
    description: "Liczba odsłon w każdym przedziale czasu.",
    category: "Ruch",
    vizType: "area",
    mapping: { xColumn: "time", yColumns: ["pageviews"] },
    sql: `SELECT toDateTime(toStartOfInterval(toTimeZone(timestamp, {{tz}}), INTERVAL {{bucket}})) AS time,
       countIf(type = 'pageview') AS pageviews
FROM scoped_events
GROUP BY time
ORDER BY time`,
  },
  {
    id: "sessions-vs-users",
    title: "Sesje i użytkownicy w czasie",
    description: "Unikalne sesje i unikalni odwiedzający obok siebie.",
    category: "Ruch",
    vizType: "line",
    mapping: { xColumn: "time", yColumns: ["sessions", "users"] },
    sql: `SELECT toDateTime(toStartOfInterval(toTimeZone(timestamp, {{tz}}), INTERVAL {{bucket}})) AS time,
       countDistinct(session_id) AS sessions,
       countDistinct(user_id) AS users
FROM scoped_events
GROUP BY time
ORDER BY time`,
  },
  {
    id: "bounce-rate-over-time",
    title: "Współczynnik odrzuceń w czasie",
    description: "Udział sesji z jedną odsłoną w każdym przedziale czasu.",
    category: "Ruch",
    vizType: "line",
    mapping: { xColumn: "time", yColumns: ["bounce_rate"] },
    sql: `SELECT toDateTime(toStartOfInterval(toTimeZone(session_start, {{tz}}), INTERVAL {{bucket}})) AS time,
       round(100 * countIf(pages = 1) / count(), 1) AS bounce_rate
FROM (
  SELECT session_id,
         min(timestamp) AS session_start,
         countIf(type = 'pageview') AS pages
  FROM scoped_events
  GROUP BY session_id
)
WHERE pages > 0
GROUP BY time
ORDER BY time`,
  },
  {
    id: "top-pages",
    title: "Najpopularniejsze strony",
    description: "Najczęściej oglądane ścieżki.",
    category: "Ruch",
    vizType: "bar",
    mapping: { xColumn: "pathname", yColumns: ["pageviews"] },
    sql: `SELECT pathname,
       countIf(type = 'pageview') AS pageviews
FROM scoped_events
GROUP BY pathname
ORDER BY pageviews DESC
LIMIT 20`,
  },
  {
    id: "acquisition-channels",
    title: "Kanały pozyskania",
    description: "Sesje pogrupowane według wyliczonego kanału marketingowego.",
    category: "Ruch",
    vizType: "bar",
    mapping: { xColumn: "channel", yColumns: ["sessions"] },
    sql: `SELECT channel,
       countDistinct(session_id) AS sessions
FROM scoped_events
GROUP BY channel
ORDER BY sessions DESC`,
  },
  {
    id: "top-referrers",
    title: "Najważniejsze odsyłacze",
    description: "Zewnętrzne strony kierujące ruch.",
    category: "Ruch",
    vizType: "table",
    mapping: {},
    sql: `SELECT referrer,
       countDistinct(session_id) AS sessions
FROM scoped_events
WHERE referrer != ''
GROUP BY referrer
ORDER BY sessions DESC
LIMIT 50`,
  },
  {
    id: "page-titles",
    title: "Najpopularniejsze tytuły stron",
    description: "Najczęstsze tytuły dokumentów z reprezentatywnymi ścieżkami.",
    category: "Ruch",
    vizType: "table",
    mapping: {},
    sql: `SELECT page_title,
       any(pathname) AS sample_path,
       countDistinct(session_id) AS sessions,
       countIf(type = 'pageview') AS pageviews
FROM scoped_events
WHERE page_title != ''
GROUP BY page_title
ORDER BY sessions DESC
LIMIT 50`,
  },
  {
    id: "top-hostnames",
    title: "Najpopularniejsze hosty",
    description: "Sesje podzielone według hosta dla stron wielodomenowych lub subdomen.",
    category: "Ruch",
    vizType: "bar",
    mapping: { xColumn: "hostname", yColumns: ["sessions"] },
    sql: `SELECT hostname,
       countDistinct(session_id) AS sessions
FROM scoped_events
WHERE hostname != ''
GROUP BY hostname
ORDER BY sessions DESC
LIMIT 20`,
  },

  // ── Audience ─────────────────────────────────────────────────────────────--
  {
    id: "top-countries",
    title: "Najpopularniejsze kraje",
    description: "Sesje według kraju odwiedzającego.",
    category: "Odbiorcy",
    vizType: "bar",
    mapping: { xColumn: "country", yColumns: ["sessions"] },
    sql: `SELECT country,
       countDistinct(session_id) AS sessions
FROM scoped_events
WHERE country != ''
GROUP BY country
ORDER BY sessions DESC
LIMIT 20`,
  },
  {
    id: "browser-breakdown",
    title: "Podział przeglądarek",
    description: "Sesje według rodziny przeglądarki.",
    category: "Odbiorcy",
    vizType: "bar",
    mapping: { xColumn: "browser", yColumns: ["sessions"] },
    sql: `SELECT browser,
       countDistinct(session_id) AS sessions
FROM scoped_events
WHERE browser != ''
GROUP BY browser
ORDER BY sessions DESC
LIMIT 15`,
  },
  {
    id: "device-type",
    title: "Podział typów urządzeń",
    description: "Sesje według klasy urządzenia.",
    category: "Odbiorcy",
    vizType: "bar",
    mapping: { xColumn: "device_type", yColumns: ["sessions"] },
    sql: `SELECT device_type,
       countDistinct(session_id) AS sessions
FROM scoped_events
WHERE device_type != ''
GROUP BY device_type
ORDER BY sessions DESC`,
  },
  {
    id: "operating-systems",
    title: "Systemy operacyjne",
    description: "Sesje według rodziny systemu operacyjnego.",
    category: "Odbiorcy",
    vizType: "bar",
    mapping: { xColumn: "operating_system", yColumns: ["sessions"] },
    sql: `SELECT operating_system,
       countDistinct(session_id) AS sessions
FROM scoped_events
WHERE operating_system != ''
GROUP BY operating_system
ORDER BY sessions DESC
LIMIT 15`,
  },
  {
    id: "top-cities",
    title: "Najpopularniejsze miasta",
    description: "Koncentracja sesji na poziomie miasta.",
    category: "Odbiorcy",
    vizType: "hbar",
    mapping: { xColumn: "location", valueColumn: "sessions" },
    sql: `SELECT concat(city, ', ', country) AS location,
       countDistinct(session_id) AS sessions
FROM scoped_events
WHERE city != '' AND country != ''
GROUP BY location
ORDER BY sessions DESC
LIMIT 30`,
  },

  // ── Behavior (beyond prebuilt) ──────────────────────────────────────────────
  {
    id: "traffic-heatmap",
    title: "Ruch według godziny i dnia tygodnia",
    description: "Odsłony pogrupowane według dnia tygodnia (1=pon.) i godziny — znajdź godziny szczytu.",
    category: "Zachowanie",
    beyondPrebuilt: true,
    vizType: "table",
    mapping: {},
    sql: `SELECT toDayOfWeek(timestamp) AS weekday,
       toHour(timestamp) AS hour,
       countIf(type = 'pageview') AS pageviews
FROM scoped_events
GROUP BY weekday, hour
ORDER BY weekday, hour`,
  },
  {
    id: "entry-pages",
    title: "Strony wejścia (landing)",
    description: "Pierwsza strona odwiedzona w każdej sesji.",
    category: "Zachowanie",
    beyondPrebuilt: true,
    vizType: "table",
    mapping: {},
    sql: `SELECT entry_page,
       countDistinct(session_id) AS sessions
FROM (
  SELECT session_id,
         argMin(pathname, timestamp) AS entry_page
  FROM scoped_events
  WHERE type = 'pageview'
  GROUP BY session_id
)
GROUP BY entry_page
ORDER BY sessions DESC
LIMIT 20`,
  },
  {
    id: "exit-pages",
    title: "Strony wyjścia",
    description: "Ostatnia strona odwiedzona w każdej sesji.",
    category: "Zachowanie",
    beyondPrebuilt: true,
    vizType: "table",
    mapping: {},
    sql: `SELECT exit_page,
       countDistinct(session_id) AS sessions
FROM (
  SELECT session_id,
         argMax(pathname, timestamp) AS exit_page
  FROM scoped_events
  WHERE type = 'pageview'
  GROUP BY session_id
)
GROUP BY exit_page
ORDER BY sessions DESC
LIMIT 20`,
  },
  {
    id: "pages-per-session",
    title: "Rozkład stron na sesję",
    description: "Ile stron odwiedzający oglądają przed wyjściem.",
    category: "Zachowanie",
    beyondPrebuilt: true,
    vizType: "bar",
    mapping: { xColumn: "pages_viewed", yColumns: ["sessions"] },
    sql: `SELECT pages_viewed,
       count() AS sessions
FROM (
  SELECT session_id,
         countIf(type = 'pageview') AS pages_viewed
  FROM scoped_events
  GROUP BY session_id
)
WHERE pages_viewed > 0
GROUP BY pages_viewed
ORDER BY pages_viewed
LIMIT 30`,
  },
  {
    id: "bounce-rate-by-landing",
    title: "Współczynnik odrzuceń według strony wejścia",
    description: "Sesje z jedną odsłoną według strony wejścia.",
    category: "Zachowanie",
    beyondPrebuilt: true,
    vizType: "table",
    mapping: {},
    sql: `SELECT entry_page,
       count() AS sessions,
       countIf(pages = 1) AS bounces,
       round(100 * countIf(pages = 1) / count(), 1) AS bounce_rate_pct
FROM (
  SELECT session_id,
         argMin(pathname, timestamp) AS entry_page,
         countIf(type = 'pageview') AS pages
  FROM scoped_events
  GROUP BY session_id
)
GROUP BY entry_page
ORDER BY sessions DESC
LIMIT 20`,
  },
  {
    id: "avg-session-duration",
    title: "Śr. czas trwania sesji w czasie",
    description: "Średnia liczba sekund między pierwszym i ostatnim zdarzeniem w sesji.",
    category: "Zachowanie",
    beyondPrebuilt: true,
    vizType: "line",
    mapping: { xColumn: "time", yColumns: ["avg_seconds"] },
    sql: `SELECT toDateTime(toStartOfInterval(toTimeZone(session_start, {{tz}}), INTERVAL {{bucket}})) AS time,
       round(avg(duration_seconds)) AS avg_seconds
FROM (
  SELECT session_id,
         min(timestamp) AS session_start,
         dateDiff('second', min(timestamp), max(timestamp)) AS duration_seconds
  FROM scoped_events
  GROUP BY session_id
)
GROUP BY time
ORDER BY time`,
  },
  {
    id: "path-to-path-conversion",
    title: "Konwersja ścieżka → ścieżka",
    description: "Ile sesji, które odwiedziły /pricing, dotarło też do /signup. Dostosuj ścieżki do swojej strony.",
    category: "Zachowanie",
    beyondPrebuilt: true,
    vizType: "table",
    mapping: {},
    sql: `SELECT count() AS pricing_sessions,
       countIf(has_signup = 1) AS converted,
       round(100 * countIf(has_signup = 1) / count(), 1) AS conversion_rate_pct
FROM (
  SELECT session_id,
         maxIf(1, pathname = '/pricing') AS has_pricing,
         maxIf(1, pathname = '/signup') AS has_signup
  FROM scoped_events
  WHERE type = 'pageview'
  GROUP BY session_id
)
WHERE has_pricing = 1`,
  },
  {
    id: "new-vs-returning-users",
    title: "Nowi i powracający użytkownicy",
    description: "Użytkownicy, których pierwszy przedział aktywności mieści się w wybranym zakresie, względem późniejszych przedziałów z tego zakresu.",
    category: "Zachowanie",
    beyondPrebuilt: true,
    vizType: "line",
    mapping: { xColumn: "time", yColumns: ["users"], seriesColumn: "visitor_type" },
    sql: `WITH first_seen AS (
  SELECT user_id,
         min(timestamp) AS first_seen_at
  FROM scoped_events
  WHERE user_id != ''
  GROUP BY user_id
)
SELECT toDateTime(toStartOfInterval(toTimeZone(e.timestamp, {{tz}}), INTERVAL {{bucket}})) AS time,
       if(
         toStartOfInterval(toTimeZone(e.timestamp, {{tz}}), INTERVAL {{bucket}}) = toStartOfInterval(toTimeZone(f.first_seen_at, {{tz}}), INTERVAL {{bucket}}),
         'New in range',
         'Returning in range'
       ) AS visitor_type,
       countDistinct(e.user_id) AS users
FROM scoped_events e
INNER JOIN first_seen f ON e.user_id = f.user_id
WHERE e.user_id != ''
GROUP BY time, visitor_type
ORDER BY time`,
  },
  {
    id: "repeat-visit-distribution",
    title: "Rozkład ponownych wizyt",
    description: "Ilu użytkowników miało 1, 2, 3 itd. sesje w wybranym zakresie.",
    category: "Zachowanie",
    beyondPrebuilt: true,
    vizType: "bar",
    mapping: { xColumn: "sessions_per_user", yColumns: ["users"] },
    sql: `SELECT sessions_per_user,
       count() AS users
FROM (
  SELECT COALESCE(NULLIF(identified_user_id, ''), user_id) AS user_key,
         countDistinct(session_id) AS sessions_per_user
  FROM scoped_events
  WHERE user_id != ''
  GROUP BY user_key
)
GROUP BY sessions_per_user
ORDER BY sessions_per_user
LIMIT 30`,
  },
  {
    id: "common-first-journeys",
    title: "Najczęstsze pierwsze ścieżki",
    description: "Najczęstsze pierwsze trzy ścieżki stron w sesji.",
    category: "Zachowanie",
    beyondPrebuilt: true,
    vizType: "table",
    mapping: {},
    sql: `SELECT arrayStringConcat(journey, ' -> ') AS journey,
       count() AS sessions
FROM (
  SELECT arraySlice(arrayCompact(groupArray(pathname)), 1, 3) AS journey
  FROM (
    SELECT session_id,
           pathname,
           timestamp
    FROM scoped_events
    WHERE type = 'pageview' AND pathname != ''
    ORDER BY session_id, timestamp
  )
  GROUP BY session_id
  HAVING length(journey) >= 2
)
GROUP BY journey
ORDER BY sessions DESC
LIMIT 50`,
  },
  {
    id: "top-page-transitions",
    title: "Najczęstsze przejścia między stronami",
    description: "Najczęstsze przejścia ze strony na kolejną stronę w sesjach.",
    category: "Zachowanie",
    beyondPrebuilt: true,
    vizType: "table",
    mapping: {},
    sql: `WITH ordered_pageviews AS (
  SELECT session_id,
         pathname AS from_path,
         leadInFrame(pathname) OVER (
           PARTITION BY session_id
           ORDER BY timestamp
           ROWS BETWEEN CURRENT ROW AND 1 FOLLOWING
         ) AS to_path
  FROM scoped_events
  WHERE type = 'pageview' AND pathname != ''
)
SELECT from_path,
       to_path,
       count() AS transitions
FROM ordered_pageviews
WHERE to_path != '' AND to_path != from_path
GROUP BY from_path, to_path
ORDER BY transitions DESC
LIMIT 50`,
  },
  {
    id: "landing-page-goal-conversion",
    title: "Konwersja strony wejścia do celu",
    description: "Sesje według strony wejścia i tego, czy wywołały wybrane zdarzenie własne. Dostosuj event_name do celu.",
    category: "Zachowanie",
    beyondPrebuilt: true,
    vizType: "table",
    mapping: {},
    sql: `SELECT entry_page,
       count() AS sessions,
       countIf(converted = 1) AS conversions,
       round(100 * countIf(converted = 1) / count(), 1) AS conversion_rate_pct
FROM (
  SELECT session_id,
         argMinIf(pathname, timestamp, type = 'pageview') AS entry_page,
         maxIf(1, type = 'custom_event' AND event_name = 'signup') AS converted
  FROM scoped_events
  GROUP BY session_id
)
WHERE entry_page != ''
GROUP BY entry_page
ORDER BY sessions DESC
LIMIT 50`,
  },
  {
    id: "conversion-rate-over-time",
    title: "Współczynnik konwersji w czasie",
    description: "Udział sesji, które wywołały wybrane zdarzenie własne w każdym przedziale. Dostosuj event_name do celu.",
    category: "Zachowanie",
    beyondPrebuilt: true,
    vizType: "line",
    mapping: { xColumn: "time", yColumns: ["conversion_rate_pct"] },
    sql: `SELECT toDateTime(toStartOfInterval(toTimeZone(session_start, {{tz}}), INTERVAL {{bucket}})) AS time,
       round(100 * countIf(converted = 1) / nullIf(count(), 0), 1) AS conversion_rate_pct
FROM (
  SELECT session_id,
         min(timestamp) AS session_start,
         maxIf(1, type = 'custom_event' AND event_name = 'signup') AS converted
  FROM scoped_events
  GROUP BY session_id
)
GROUP BY time
ORDER BY time`,
  },
  {
    id: "entry-to-exit-pairs",
    title: "Pary wejście → wyjście",
    description: "Najczęstsze kombinacje strony wejścia i strony końcowej w sesjach.",
    category: "Zachowanie",
    beyondPrebuilt: true,
    vizType: "table",
    mapping: {},
    sql: `SELECT entry_page,
       exit_page,
       count() AS sessions,
       round(avg(pages), 2) AS avg_pages
FROM (
  SELECT session_id,
         argMinIf(pathname, timestamp, type = 'pageview') AS entry_page,
         argMaxIf(pathname, timestamp, type = 'pageview') AS exit_page,
         countIf(type = 'pageview') AS pages
  FROM scoped_events
  GROUP BY session_id
)
WHERE entry_page != '' AND exit_page != ''
GROUP BY entry_page, exit_page
ORDER BY sessions DESC
LIMIT 50`,
  },
  {
    id: "dead-end-pages",
    title: "Strony kończące sesję",
    description: "Strony wyjścia, które często kończą sesje jednostronicowe.",
    category: "Zachowanie",
    beyondPrebuilt: true,
    vizType: "table",
    mapping: {},
    sql: `SELECT exit_page,
       count() AS exit_sessions,
       countIf(pages = 1) AS dead_end_sessions,
       round(100 * countIf(pages = 1) / nullIf(count(), 0), 1) AS dead_end_rate_pct
FROM (
  SELECT session_id,
         argMaxIf(pathname, timestamp, type = 'pageview') AS exit_page,
         countIf(type = 'pageview') AS pages
  FROM scoped_events
  GROUP BY session_id
)
WHERE exit_page != ''
GROUP BY exit_page
HAVING exit_sessions >= 5
ORDER BY dead_end_rate_pct DESC, exit_sessions DESC
LIMIT 50`,
  },

  // ── Events & interactions ───────────────────────────────────────────────────
  {
    id: "custom-events-over-time",
    title: "Zdarzenia własne w czasie",
    description: "Najważniejsze zdarzenia własne podzielone na serie.",
    category: "Zdarzenia",
    vizType: "line",
    mapping: { xColumn: "time", yColumns: ["events"], seriesColumn: "event_name" },
    sql: `SELECT toDateTime(toStartOfInterval(toTimeZone(timestamp, {{tz}}), INTERVAL {{bucket}})) AS time,
       event_name,
       count() AS events
FROM scoped_events
WHERE type = 'custom_event'
GROUP BY time, event_name
ORDER BY time`,
  },
  {
    id: "events-by-type",
    title: "Zdarzenia według typu",
    description: "Surowa liczba zdarzeń według śledzonego typu.",
    category: "Zdarzenia",
    vizType: "pie",
    mapping: { xColumn: "type", valueColumn: "events" },
    sql: `SELECT type,
       count() AS events
FROM scoped_events
GROUP BY type
ORDER BY events DESC`,
  },
  {
    id: "outbound-links",
    title: "Kliknięcia linków wychodzących",
    description: "Dokąd odwiedzający klikają poza stronę.",
    category: "Zdarzenia",
    beyondPrebuilt: true,
    vizType: "table",
    mapping: {},
    sql: `SELECT JSONExtractString(toString(props), 'url') AS destination,
       count() AS clicks
FROM scoped_events
WHERE type = 'outbound'
GROUP BY destination
ORDER BY clicks DESC
LIMIT 50`,
  },
  {
    id: "button-clicks",
    title: "Najczęściej klikane przyciski",
    description: "Śledzone kliknięcia przycisków według etykiety.",
    category: "Zdarzenia",
    beyondPrebuilt: true,
    vizType: "table",
    mapping: {},
    sql: `SELECT JSONExtractString(toString(props), 'text') AS button_text,
       count() AS clicks
FROM scoped_events
WHERE type = 'button_click'
GROUP BY button_text
ORDER BY clicks DESC
LIMIT 30`,
  },
  {
    id: "form-submissions",
    title: "Wysłania formularzy",
    description: "Zdarzenia wysłania pogrupowane według nazwy formularza.",
    category: "Zdarzenia",
    beyondPrebuilt: true,
    vizType: "table",
    mapping: {},
    sql: `SELECT JSONExtractString(toString(props), 'formName') AS form_name,
       count() AS submissions
FROM scoped_events
WHERE type = 'form_submit'
GROUP BY form_name
ORDER BY submissions DESC
LIMIT 30`,
  },
  {
    id: "copied-text",
    title: "Najczęściej kopiowany tekst",
    description: "Fragmenty kopiowane przez odwiedzających ze stron.",
    category: "Zdarzenia",
    beyondPrebuilt: true,
    vizType: "table",
    mapping: {},
    sql: `SELECT JSONExtractString(toString(props), 'text') AS copied_text,
       count() AS copies
FROM scoped_events
WHERE type = 'copy'
GROUP BY copied_text
ORDER BY copies DESC
LIMIT 30`,
  },
  {
    id: "js-errors",
    title: "Błędy JavaScript",
    description: "Zdarzenia błędów według nazwy i komunikatu.",
    category: "Zdarzenia",
    vizType: "table",
    mapping: {},
    sql: `SELECT event_name AS error,
       JSONExtractString(toString(props), 'message') AS message,
       count() AS occurrences,
       countDistinct(session_id) AS affected_sessions
FROM scoped_events
WHERE type = 'error'
GROUP BY error, message
ORDER BY occurrences DESC
LIMIT 50`,
  },
  {
    id: "errors-over-time",
    title: "Błędy w czasie",
    description: "Liczba błędów JavaScript w każdym przedziale czasu.",
    category: "Zdarzenia",
    vizType: "line",
    mapping: { xColumn: "time", yColumns: ["errors"] },
    sql: `SELECT toDateTime(toStartOfInterval(toTimeZone(timestamp, {{tz}}), INTERVAL {{bucket}})) AS time,
       count() AS errors
FROM scoped_events
WHERE type = 'error'
GROUP BY time
ORDER BY time`,
  },
  {
    id: "error-pages",
    title: "Strony z błędami",
    description: "Ścieżki uszeregowane według liczby błędów i dotkniętych sesji.",
    category: "Zdarzenia",
    vizType: "table",
    mapping: {},
    sql: `SELECT pathname,
       count() AS errors,
       countDistinct(session_id) AS affected_sessions
FROM scoped_events
WHERE type = 'error' AND pathname != ''
GROUP BY pathname
ORDER BY errors DESC
LIMIT 50`,
  },
  {
    id: "error-rate-over-time",
    title: "Współczynnik błędów w czasie",
    description: "Błędy JavaScript na 1000 odsłon w każdym przedziale czasu.",
    category: "Zdarzenia",
    beyondPrebuilt: true,
    vizType: "line",
    mapping: { xColumn: "time", yColumns: ["errors_per_1k_pageviews"] },
    sql: `SELECT toDateTime(toStartOfInterval(toTimeZone(timestamp, {{tz}}), INTERVAL {{bucket}})) AS time,
       round(1000 * countIf(type = 'error') / nullIf(countIf(type = 'pageview'), 0), 1) AS errors_per_1k_pageviews
FROM scoped_events
GROUP BY time
ORDER BY time`,
  },
  {
    id: "browser-error-rate",
    title: "Współczynnik błędów według przeglądarki",
    description: "Błędy JavaScript na 1000 odsłon według przeglądarki.",
    category: "Zdarzenia",
    beyondPrebuilt: true,
    vizType: "table",
    mapping: {},
    sql: `SELECT browser,
       pageviews,
       errors,
       round(1000 * errors / nullIf(pageviews, 0), 1) AS errors_per_1k_pageviews
FROM (
  SELECT browser,
         countIf(type = 'pageview') AS pageviews,
         countIf(type = 'error') AS errors
  FROM scoped_events
  WHERE browser != ''
  GROUP BY browser
)
WHERE errors > 0
ORDER BY errors_per_1k_pageviews DESC, errors DESC
LIMIT 30`,
  },
  {
    id: "outbound-ctr-by-page",
    title: "CTR linków wychodzących według strony",
    description: "Kliknięcia wychodzące względem odsłon według ścieżki.",
    category: "Zdarzenia",
    beyondPrebuilt: true,
    vizType: "table",
    mapping: {},
    sql: `SELECT pathname,
       countIf(type = 'pageview') AS pageviews,
       countIf(type = 'outbound') AS outbound_clicks,
       round(100 * countIf(type = 'outbound') / nullIf(countIf(type = 'pageview'), 0), 1) AS outbound_ctr_pct
FROM scoped_events
WHERE pathname != ''
GROUP BY pathname
HAVING outbound_clicks > 0
ORDER BY outbound_ctr_pct DESC
LIMIT 50`,
  },
  {
    id: "custom-event-property-breakdown",
    title: "Podział właściwości zdarzenia własnego",
    description: "Podziel wybrane zdarzenie własne według wybranej właściwości. Dostosuj event_name i klucz właściwości.",
    category: "Zdarzenia",
    beyondPrebuilt: true,
    vizType: "bar",
    mapping: { xColumn: "property_value", yColumns: ["events", "sessions"] },
    sql: `SELECT JSONExtractString(toString(props), 'plan') AS property_value,
       count() AS events,
       countDistinct(session_id) AS sessions
FROM scoped_events
WHERE type = 'custom_event'
  AND event_name = 'signup'
  AND JSONExtractString(toString(props), 'plan') != ''
GROUP BY property_value
ORDER BY events DESC
LIMIT 30`,
  },
  {
    id: "form-abandonment-by-form",
    title: "Porzucenia formularzy według formularza",
    description: "Sesje z aktywnością w polach formularza bez wysłania tego samego formularza.",
    category: "Zdarzenia",
    beyondPrebuilt: true,
    vizType: "table",
    mapping: {},
    sql: `SELECT form_name,
       count() AS sessions_with_input,
       countIf(has_submit = 0) AS abandoned_sessions,
       round(100 * countIf(has_submit = 0) / count(), 1) AS abandonment_rate_pct
FROM (
  SELECT session_id,
         JSONExtractString(toString(props), 'formName') AS form_name,
         countIf(type = 'input_change') AS input_events,
         maxIf(1, type = 'form_submit') AS has_submit
  FROM scoped_events
  WHERE type IN ('input_change', 'form_submit')
  GROUP BY session_id, form_name
)
WHERE form_name != '' AND input_events > 0
GROUP BY form_name
ORDER BY abandoned_sessions DESC
LIMIT 50`,
  },
  {
    id: "repeated-button-clicks",
    title: "Powtarzane kliknięcia przycisków",
    description: "Potencjalne tarcie: sesje z wielokrotnym klikaniem tego samego przycisku na stronie.",
    category: "Zdarzenia",
    beyondPrebuilt: true,
    vizType: "table",
    mapping: {},
    sql: `SELECT pathname,
       JSONExtractString(toString(props), 'text') AS button_text,
       session_id,
       count() AS clicks
FROM scoped_events
WHERE type = 'button_click'
GROUP BY pathname, button_text, session_id
HAVING clicks >= 5
ORDER BY clicks DESC
LIMIT 50`,
  },

  // ── Performance ────────────────────────────────────────────────────────────
  {
    id: "web-vitals-over-time",
    title: "Web Vitals (p75) w czasie",
    description: "75. percentyl LCP i INP w każdym przedziale.",
    category: "Wydajność",
    beyondPrebuilt: true,
    vizType: "line",
    mapping: { xColumn: "time", yColumns: ["lcp_p75", "inp_p75"] },
    sql: `SELECT toDateTime(toStartOfInterval(toTimeZone(timestamp, {{tz}}), INTERVAL {{bucket}})) AS time,
       round(quantile(0.75)(lcp)) AS lcp_p75,
       round(quantile(0.75)(inp)) AS inp_p75
FROM scoped_events
WHERE type = 'performance'
GROUP BY time
ORDER BY time`,
  },
  {
    id: "slowest-pages",
    title: "Najwolniejsze strony według LCP",
    description: "Strony uszeregowane według 75. percentyla Largest Contentful Paint.",
    category: "Wydajność",
    beyondPrebuilt: true,
    vizType: "table",
    mapping: {},
    sql: `SELECT pathname,
       round(quantile(0.75)(lcp)) AS lcp_p75_ms,
       count() AS samples
FROM scoped_events
WHERE type = 'performance' AND lcp IS NOT NULL
GROUP BY pathname
ORDER BY lcp_p75_ms DESC
LIMIT 20`,
  },
  {
    id: "web-vitals-by-device",
    title: "Web Vitals według urządzenia",
    description: "75. percentyl LCP i INP według typu urządzenia.",
    category: "Wydajność",
    beyondPrebuilt: true,
    vizType: "bar",
    mapping: { xColumn: "device_type", yColumns: ["lcp_p75_ms", "inp_p75_ms"] },
    sql: `SELECT device_type,
       round(quantile(0.75)(lcp)) AS lcp_p75_ms,
       round(quantile(0.75)(inp)) AS inp_p75_ms,
       count() AS samples
FROM scoped_events
WHERE type = 'performance'
  AND device_type != ''
  AND (lcp IS NOT NULL OR inp IS NOT NULL)
GROUP BY device_type
ORDER BY lcp_p75_ms DESC`,
  },
  {
    id: "poor-vitals-share",
    title: "Udział słabych Web Vitals",
    description: "Udział próbek wydajności powyżej typowych progów LCP, INP lub CLS.",
    category: "Wydajność",
    beyondPrebuilt: true,
    vizType: "stat",
    mapping: { valueColumn: "poor_vitals_pct", valueFormat: "percent" },
    sql: `SELECT round(100 * countIf(lcp > 2500 OR inp > 200 OR cls > 0.1) / nullIf(count(), 0), 1) AS poor_vitals_pct
FROM scoped_events
WHERE type = 'performance'`,
  },
  {
    id: "performance-sample-coverage",
    title: "Pokrycie próbek wydajności",
    description: "Strony z niskim pokryciem próbek Web Vitals względem odsłon.",
    category: "Wydajność",
    beyondPrebuilt: true,
    vizType: "table",
    mapping: {},
    sql: `SELECT pathname,
       pageviews,
       performance_samples,
       round(100 * performance_samples / nullIf(pageviews, 0), 1) AS coverage_pct
FROM (
  SELECT pathname,
         countIf(type = 'pageview') AS pageviews,
         countIf(type = 'performance') AS performance_samples
  FROM scoped_events
  WHERE pathname != ''
  GROUP BY pathname
)
WHERE pageviews >= 10
ORDER BY coverage_pct ASC, pageviews DESC
LIMIT 50`,
  },

  // ── Marketing ──────────────────────────────────────────────────────────────
  {
    id: "utm-campaigns",
    title: "Skuteczność kampanii UTM",
    description: "Sesje według utm_campaign.",
    category: "Marketing",
    beyondPrebuilt: true,
    vizType: "bar",
    mapping: { xColumn: "campaign", yColumns: ["sessions"] },
    sql: `SELECT url_parameters['utm_campaign'] AS campaign,
       countDistinct(session_id) AS sessions
FROM scoped_events
WHERE url_parameters['utm_campaign'] != ''
GROUP BY campaign
ORDER BY sessions DESC
LIMIT 20`,
  },
  {
    id: "utm-source-medium",
    title: "Źródło / medium UTM",
    description: "Sesje w podziale na źródło i medium.",
    category: "Marketing",
    beyondPrebuilt: true,
    vizType: "table",
    mapping: {},
    sql: `SELECT url_parameters['utm_source'] AS source,
       url_parameters['utm_medium'] AS medium,
       countDistinct(session_id) AS sessions
FROM scoped_events
WHERE url_parameters['utm_source'] != ''
GROUP BY source, medium
ORDER BY sessions DESC
LIMIT 30`,
  },
  {
    id: "channel-goal-conversion",
    title: "Konwersja kanału do celu",
    description: "Jakość kanału pierwszego kontaktu dla wybranego zdarzenia własnego. Dostosuj event_name do celu.",
    category: "Marketing",
    beyondPrebuilt: true,
    vizType: "bar",
    mapping: { xColumn: "channel", yColumns: ["sessions", "conversions"] },
    sql: `SELECT channel,
       count() AS sessions,
       countIf(converted = 1) AS conversions,
       round(100 * countIf(converted = 1) / count(), 1) AS conversion_rate_pct
FROM (
  SELECT session_id,
         argMin(channel, timestamp) AS channel,
         maxIf(1, type = 'custom_event' AND event_name = 'signup') AS converted
  FROM scoped_events
  GROUP BY session_id
)
WHERE channel != ''
GROUP BY channel
ORDER BY conversions DESC`,
  },
  {
    id: "referrer-conversion-quality",
    title: "Jakość konwersji z odsyłaczy",
    description: "Zewnętrzne odsyłacze uszeregowane według współczynnika konwersji dla wybranego zdarzenia własnego.",
    category: "Marketing",
    beyondPrebuilt: true,
    vizType: "table",
    mapping: {},
    sql: `SELECT referrer,
       count() AS sessions,
       countIf(converted = 1) AS conversions,
       round(100 * countIf(converted = 1) / nullIf(count(), 0), 1) AS conversion_rate_pct
FROM (
  SELECT session_id,
         argMinIf(referrer, timestamp, referrer != '') AS referrer,
         maxIf(1, type = 'custom_event' AND event_name = 'signup') AS converted
  FROM scoped_events
  GROUP BY session_id
)
WHERE referrer != ''
GROUP BY referrer
HAVING sessions >= 5
ORDER BY conversion_rate_pct DESC, conversions DESC
LIMIT 50`,
  },
  {
    id: "campaign-engagement-quality",
    title: "Jakość zaangażowania kampanii",
    description: "Kampanie UTM uszeregowane według sesji, współczynnika odrzuceń i stron na sesję.",
    category: "Marketing",
    beyondPrebuilt: true,
    vizType: "table",
    mapping: {},
    sql: `SELECT campaign,
       count() AS sessions,
       round(avg(pages), 2) AS pages_per_session,
       round(100 * countIf(pages = 1) / count(), 1) AS bounce_rate_pct
FROM (
  SELECT session_id,
         argMin(url_parameters['utm_campaign'], timestamp) AS campaign,
         countIf(type = 'pageview') AS pages
  FROM scoped_events
  GROUP BY session_id
)
WHERE campaign != '' AND pages > 0
GROUP BY campaign
ORDER BY sessions DESC
LIMIT 50`,
  },
  {
    id: "ai-and-paid-traffic-trend",
    title: "Trend ruchu AI i płatnego",
    description: "Sesje z kanałów AI i płatnych w czasie.",
    category: "Marketing",
    beyondPrebuilt: true,
    vizType: "line",
    mapping: { xColumn: "time", yColumns: ["sessions"], seriesColumn: "channel" },
    sql: `SELECT toDateTime(toStartOfInterval(toTimeZone(timestamp, {{tz}}), INTERVAL {{bucket}})) AS time,
       channel,
       countDistinct(session_id) AS sessions
FROM scoped_events
WHERE channel IN ('AI', 'Paid AI', 'Paid Search', 'Paid Social', 'Paid Video', 'Paid Shopping')
GROUP BY time, channel
ORDER BY time`,
  },

  // ── Power user ─────────────────────────────────────────────────────────────
  {
    id: "identified-users",
    title: "Najaktywniejsi zidentyfikowani użytkownicy",
    description: "Aktywność między sesjami dla użytkowników ustawionych przez identify().",
    category: "Zaawansowane",
    beyondPrebuilt: true,
    vizType: "table",
    mapping: {},
    sql: `SELECT identified_user_id,
       count() AS events,
       countDistinct(session_id) AS sessions,
       max(timestamp) AS last_seen
FROM scoped_events
WHERE identified_user_id != ''
GROUP BY identified_user_id
ORDER BY events DESC
LIMIT 50`,
  },
  {
    id: "languages",
    title: "Języki odwiedzających",
    description: "Sesje według języka przeglądarki.",
    category: "Zaawansowane",
    beyondPrebuilt: true,
    vizType: "bar",
    mapping: { xColumn: "language", yColumns: ["sessions"] },
    sql: `SELECT language,
       countDistinct(session_id) AS sessions
FROM scoped_events
WHERE language != ''
GROUP BY language
ORDER BY sessions DESC
LIMIT 15`,
  },
  {
    id: "tag-breakdown",
    title: "Podział tagów",
    description: "Ruch podzielony według opcjonalnego tagu strony/skryptu.",
    category: "Zaawansowane",
    beyondPrebuilt: true,
    vizType: "table",
    mapping: {},
    sql: `SELECT if(tag = '', '(untagged)', tag) AS script_tag,
       countDistinct(session_id) AS sessions,
       countIf(type = 'pageview') AS pageviews,
       count() AS events
FROM scoped_events
GROUP BY script_tag
ORDER BY sessions DESC
LIMIT 50`,
  },
  {
    id: "imported-vs-native-traffic",
    title: "Ruch importowany i natywny",
    description: "Zdarzenia, odsłony, sesje i użytkownicy podzieleni na dane importowane i śledzenie natywne.",
    category: "Zaawansowane",
    beyondPrebuilt: true,
    vizType: "table",
    mapping: {},
    sql: `SELECT if(isNull(import_id), 'Native tracking', 'Imported data') AS data_source,
       count() AS events,
       countIf(type = 'pageview') AS pageviews,
       countDistinct(session_id) AS sessions,
       countDistinct(user_id) AS users
FROM scoped_events
GROUP BY data_source
ORDER BY events DESC`,
  },
  {
    id: "time-to-conversion",
    title: "Czas do konwersji",
    description: "Mediana i p90 sekund od pierwszej odsłony do wybranego zdarzenia własnego. Dostosuj event_name do celu.",
    category: "Zaawansowane",
    beyondPrebuilt: true,
    vizType: "table",
    mapping: {},
    sql: `SELECT round(quantile(0.5)(seconds_to_convert)) AS median_seconds,
       round(quantile(0.9)(seconds_to_convert)) AS p90_seconds,
       count() AS converted_sessions
FROM (
  SELECT session_id,
         minIf(timestamp, type = 'pageview') AS first_pageview_at,
         minIf(timestamp, type = 'custom_event' AND event_name = 'signup') AS converted_at,
         dateDiff('second', first_pageview_at, converted_at) AS seconds_to_convert
  FROM scoped_events
  GROUP BY session_id
  HAVING converted_at > first_pageview_at
)`,
  },
  {
    id: "screen-width-distribution",
    title: "Rozkład szerokości ekranu",
    description: "Sesje pogrupowane w przedziały szerokości viewportu co 200 px.",
    category: "Zaawansowane",
    beyondPrebuilt: true,
    vizType: "bar",
    mapping: { xColumn: "width_bucket", yColumns: ["sessions"] },
    sql: `SELECT intDiv(screen_width, 200) * 200 AS width_bucket_start,
       concat(toString(width_bucket_start), '-', toString(width_bucket_start + 199), 'px') AS width_bucket,
       countDistinct(session_id) AS sessions
FROM scoped_events
WHERE screen_width > 0
GROUP BY width_bucket_start, width_bucket
ORDER BY width_bucket_start`,
  },
  {
    id: "suspicious-high-rate-sessions",
    title: "Podejrzane sesje o wysokiej częstotliwości",
    description: "Sesje podobne do botów lub zaszumione, z wieloma zdarzeniami na minutę, tylko na danych scoped_events.",
    category: "Zaawansowane",
    beyondPrebuilt: true,
    vizType: "table",
    mapping: {},
    sql: `SELECT session_id,
       user_id,
       count() AS events,
       dateDiff('second', min(timestamp), max(timestamp)) AS duration_seconds,
       round(events / greatest(duration_seconds / 60, 1), 1) AS events_per_minute,
       countIf(type = 'pageview') AS pageviews,
       countIf(type = 'error') AS errors
FROM scoped_events
GROUP BY session_id, user_id
HAVING events >= 100 OR events_per_minute >= 60
ORDER BY events_per_minute DESC
LIMIT 50`,
  },
  {
    id: "zero-viewport-traffic",
    title: "Ruch bez wymiarów ekranu",
    description: "Sesje bez wymiarów ekranu, co może wskazywać problemy z instrumentacją lub automatyzacją.",
    category: "Zaawansowane",
    beyondPrebuilt: true,
    vizType: "table",
    mapping: {},
    sql: `SELECT channel,
       browser,
       operating_system,
       countDistinct(session_id) AS sessions
FROM scoped_events
WHERE screen_width = 0 OR screen_height = 0
GROUP BY channel, browser, operating_system
ORDER BY sessions DESC
LIMIT 50`,
  },
];

export const DASHBOARD_EXAMPLE_CATEGORIES: string[] = Array.from(
  DASHBOARD_EXAMPLES.reduce((set, example) => set.add(example.category), new Set<string>())
);
