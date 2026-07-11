# WoT-CV Polish translation quality gate

Data walidacji: 2026-07-11

## Zakres

- Sprawdzono kompletność `client/messages/pl.json` względem `client/messages/en.json`.
- Zweryfikowano, że polski katalog nie zawiera pustych wartości dla kluczy obecnych w katalogu angielskim.
- Uruchomiono kontrolę typów, lint, build produkcyjny klienta i audyt potencjalnych hardcoded stringów.

## Wyniki

| Kontrola | Wynik |
| --- | --- |
| `missing-or-empty-pl` | `0` |
| `cd client && npx tsc --noEmit` | OK |
| `cd client && npm run lint` | OK, z istniejącym ostrzeżeniem `ESLintEmptyConfigWarning` |
| `cd client && npm run build` | OK |
| `cd client && npm run audit:polish -- --limit=120` | OK, audyt nadal zgłasza fałszywe trafienia na polskie teksty, nazwy planów i stringi techniczne |
| `git diff --check` | OK |

## Uwagi

- Podczas `next build` pojawia się niekrytyczny log `Failed to parse URL from /api/auth/get-session`, ale proces kończy się kodem `0` i generuje build poprawnie.
- Audyt `audit:polish` jest heurystyczny. W wynikach pozostają m.in. nazwy planów (`Basic`, `Standard`, `Pro`), przykładowe nazwy firm, techniczne wartości API oraz polskie stringi błędnie wykryte jako potencjalnie angielskie.
