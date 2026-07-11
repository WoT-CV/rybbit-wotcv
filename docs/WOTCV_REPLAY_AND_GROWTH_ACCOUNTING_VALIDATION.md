# Walidacja Replay i Growth Accounting

**Data:** 2026-07-11

## Zrealizowane etapy

- Pomijanie bezczynności jest domyślnie aktywne.
- Odtwarzacz wykonuje bezpośredni skok bez zmiany prędkości.
- Skok zachowuje `1000 ms` po ostatniej aktywności i `500 ms` przed następną aktywnością.
- Końcowa bezczynność jest pomijana do końca nagrania.
- Backend udostępnia endpoint Growth Accounting.
- Strona Retencja pokazuje nowych, powracających, reaktywowanych i uśpionych użytkowników.
- Nowe teksty zostały dodane do wszystkich obsługiwanych plików językowych.

## Wyniki lokalnej walidacji

Zakończone powodzeniem:

```text
cd client && npx tsc --noEmit
cd client && npm run build
cd server && npm run build
git diff --check
```

Build klienta kończy się kodem `0`. Next.js nadal wypisuje istniejący, nieblokujący komunikat:

```text
TypeError: Failed to parse URL from /api/auth/get-session
```

Pełny lint nie stanowi obecnie działającej bramki jakości. `client/eslint.config.mjs` jest pusty, przez co źródła są ignorowane, a polecenie `npm run lint` analizuje wygenerowany katalog `.next` i zgłasza brak reguły `@typescript-eslint/no-unused-vars`.

## Korekta zapytania ClickHouse

Końcowa walidacja wykryła ryzyko związane z wartościami domyślnymi po `FULL OUTER JOIN`. Połączenie wyników aktywnych i uśpionych użytkowników zostało zastąpione przez `UNION ALL` oraz końcową agregację po okresie.

Dzięki temu okres zawierający wyłącznie uśpionych użytkowników zachowuje prawidłową datę i nie może zostać przypisany do wartości domyślnej `DateTime`.

## Pomiar po wdrożeniu

Lokalne środowisko Windows nie udostępnia Dockera ani `clickhouse-local`, dlatego rzeczywisty czas zapytania należy zmierzyć po wdrożeniu na Ubuntu.

Skrypt:

```text
scripts/wotcv-growth-accounting-smoke.sh
```

Przykład dla lokalnego backendu na serwerze:

```bash
cd /home/rybbit-wotcv
WOTCV_SITE_ID=123 bash scripts/wotcv-growth-accounting-smoke.sh
```

Jeżeli witryna wymaga sesji uwierzytelnionej:

```bash
WOTCV_SITE_ID=123 \
WOTCV_AUTH_COOKIE='nazwa_cookie=wartosc' \
bash scripts/wotcv-growth-accounting-smoke.sh
```

Skrypt wykonuje pomiary dla `30`, `90` i `365` dni, pokazuje kod HTTP, czas odpowiedzi, liczbę okresów i najnowszy punkt wykresu. Wartości cookie nie są wypisywane do logu.

## Kryteria do sprawdzenia na danych rzeczywistych

```text
aktywni(P) = nowi(P) + powracający(P) + reaktywowani(P)
```

`uśpieni(P)` muszą odpowiadać użytkownikom aktywnym w `P-1`, którzy nie byli aktywni w `P`.

Jeżeli zakres `365` dni regularnie przekracza `2 s`, kolejnym krokiem będzie dedykowany agregat ClickHouse. Nie jest on potrzebny przed wykonaniem rzeczywistych pomiarów.
