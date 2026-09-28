# Plan pierwszego wdrożenia NOC Priority

Platforma: Cloudflare Workers (Static Assets). Podstawa: `context/foundation/infrastructure.md` (2026-09-24).

**Wdrożone 2026-09-25: <https://noc-priority.grzeho.workers.dev>** — aktywna wersja `786e08d4-b6fe-4a2d-8511-b13481806729`.

Legenda: `[x]` zrobione · `[ ]` do zrobienia · `[~]` w toku · `[-]` świadomie pominięte

## Postęp

| Faza                               | Stan  |
| ---------------------------------- | ----- |
| 0. Przygotowanie (kroki 1–3 infra) | `[x]` |
| 1. Subdomena `workers.dev`         | `[x]` |
| 2. Build                           | `[x]` |
| 3. Pierwszy deploy                 | `[x]` |
| 4. Sekrety produkcyjne             | `[x]` |
| 5. Weryfikacja ręczna              | `[~]` |

## Kontekst

`infrastructure.md` wybiera **Cloudflare Workers** jako platformę, bo nie wymaga żadnej migracji: adapter
`@astrojs/cloudflare` 14.3.1, `wrangler.jsonc` i przepływ `npm run build && npx wrangler deploy` są już w repo.
`context/foundation/tech-stack.md` mówi `cloudflare-pages`, ale adapter v14 nie wspiera już Pages — źródłem prawdy jest
`wrangler.jsonc`. To rozbieżność znana i celowo niepoprawiana.

Decyzje dla tego wdrożenia: plan **Free** (nie Paid), sekrety wgrane z lokalnego `.env`, weryfikacja **ręczna** (bez
`npm run smoke`), Cloudflare Access **później**.

## Faza 0 — przygotowanie `[x]`

- [x] `wrangler.jsonc` ma `"name": "noc-priority"` — zacommitowane (krok 1 z „Getting Started").
- [x] Uwierzytelnienie: konto `grzeho@poczta.onet.pl`, account ID `bdae13d537f5afd7f92714ea74e079ab`; token ma
      `workers (write)` i `workers_scripts (write)` (krok 2).
- [x] Walidacja lokalna: `npx astro sync`, `npm run lint`, `npx astro check` (30 plików, 0 błędów), `npm run build` (krok 3).
- [x] Cloud Supabase `xcaomlazjuveswiormeq.supabase.co` odpowiada 401 na `/auth/v1/health` — projekt nie jest uśpiony.

## Faza 1 — subdomena `workers.dev` `[x]`

Subdomena jest **na poziomie konta** (`*.workers.dev`), niezależna od nazwy Workera — pierwsza próba deployu padła na
jej braku, a auto-rejestracja `10x-astro-starter` zderzyła się z nazwą zajętą globalnie.

- [x] Zarejestrowana subdomena konta: `grzeho`
- [x] Hostname: **<https://noc-priority.grzeho.workers.dev>**

## Faza 2 — build `[x]`

- [x] Zwolnić `dist/` — zawieszony `astro preview` trzymał `dist/client` (EPERM / `Device or resource busy`); proces
      znaleziony przez `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'astro|workerd' }`
      i zamknięty ręcznie.
- [x] `npm run build` — 28 modułów, 2.06 MiB, server built w 15.14 s.

## Faza 3 — pierwszy deploy `[x]`

- [x] `npx wrangler deploy` — upload 15.80 s, wersja `e990a020-a80a-462e-8a13-3ef99235084a`.
- [x] Bindingi potwierdzone przez wrangler: `env.SESSION` (KV), `env.IMAGES`, `env.ASSETS`.

Ta wersja wstała **bez sekretów**, czyli z wyłączonym auth — stan przelotowy, naprawiony w fazie 4.

Uwaga z outputu: Preview URLs są **włączone domyślnie**, bo `preview_urls` nie ma w `wrangler.jsonc`. Do wyłączenia
`"preview_urls": false`, jeśli nieużywane (patrz rejestr ryzyk: publiczne preview URL-e).

## Faza 4 — sekrety produkcyjne `[x]`

Wartości z `.env` (cloud Supabase), nieinteraktywnie, z obcięciem `\r` na wypadek końcówek CRLF.

- [x] `npx wrangler secret put SUPABASE_URL` — wersja `5ec9ee43-63e3-40df-9106-7058e1e54994`
- [x] `npx wrangler secret put SUPABASE_KEY` — wersja `786e08d4-b6fe-4a2d-8511-b13481806729` (aktywna, 100%)

Każde `secret put` od razu wdrożyło nową wersję (`infrastructure.md`, „Unknown unknowns") — tu pożądane: po drugim
poleceniu na produkcji stoi wersja z pełną konfiguracją.

## Faza 5 — weryfikacja ręczna `[~]`

- [x] `npx wrangler deployments list` — trzy wersje, aktywna `786e08d4…` przy 100% ruchu.
- [x] `https://noc-priority.grzeho.workers.dev/` → 200 w 0.31 s, **brak** bannera „Supabase nie jest skonfigurowany —
      funkcje uwierzytelniania są wyłączone." (`src/lib/config-status.ts`). To jedyny sygnał, że sekrety weszły;
      `createClient()` zwraca `null` po cichu.
- [x] `/dashboard` bez sesji → 302 na `/auth/signin` (`PROTECTED_ROUTES` w `src/middleware.ts`).
- [ ] `npx wrangler tail --format pretty` przy realnym logowaniu — CPU time i błędy runtime. **Nie wykonane**: wymaga
      sesji w przeglądarce, a zalogować się nie ma czym (patrz „Znane luki").

## Plan Free: co z tym zrobić

`infrastructure.md` rekomenduje Paid ($5), żeby uciec od limitu 10 ms CPU na żądanie (ryzyko M/H: parsowanie CSV + SSR
listy na zimnym izolacie → błąd 1102). Przy planie Free:

- [ ] Sprawdzić CPU time w `wrangler tail` na realnym żądaniu.
- [ ] Pomiar na 200-wierszowym CSV — **gdy upload powstanie** (blokuje: brak uploadu w kodzie).

Próg zacznie boleć dopiero przy wgrywaniu CSV, a tego jeszcze nie ma (`src/pages` to na razie auth + `dashboard.astro`
ze statyczną treścią). Upgrade to jedno kliknięcie w dashboardzie, bez zmian w repo.

## Poza zakresem tego wdrożenia

- [-] **`npm run smoke` na produkcji.** `scripts/smoke.mjs` generuje `smoke-<timestamp>@example.com` i woła
      `/api/auth/signup`, czyli zapisałby śmieciowe konto do cloudowego Supabase. Skrypt nie ma filtra pozwalającego
      pominąć ten krok. Zostaje jako check lokalny i w CI.
- [-] **Cloudflare Access.** Hostname `*.workers.dev` jest publiczny; wystawiona jest tylko strona logowania
      (ryzyko H/L w rejestrze).
- [-] **Zmiany w CI.** `.github/workflows/ci.yml` nie ma joba deployu i tak zostaje — wdrożenie jest ręczne, zgodnie z
      `infrastructure.md`.

## Znane luki po wdrożeniu (osobne zadania)

- [ ] **Konta i migracje.** `supabase/migrations/` jest puste, kont operatora i admina nikt nie zasiał. **Nikt się nie
      zaloguje.** Faza 5 potwierdza tylko, że konfiguracja dojechała, nie że da się wejść.
- [ ] **Ustawienia Auth w projekcie cloudowym.** `supabase/config.toml` wyłącza potwierdzanie maila tylko lokalnie; w
      chmurze to ręczny przełącznik (krok 4 „Getting Started"). Dla logowania hasłem istniejącego konta bez znaczenia,
      dla zakładania kont — istotne.
- [ ] **`preview_urls: false`** w `wrangler.jsonc`, jeśli preview URL-e nie są potrzebne.

## Rollback

`npx wrangler deployments list`, potem `npx wrangler rollback <version-id>` — działa w sekundach na ostatnich 100
wersjach. Nie cofa migracji Supabase, ale tutaj żadnych nie ma.
