---
project: "NOC Priority"
version: 1
status: draft
created: 2026-09-28
updated: 2026-09-29
prd_version: 1
main_goal: speed
top_blocker: time
milestone_id: mvp-priority-flow
milestone_seq: 1
milestone_status: open
---

# Roadmap: NOC Priority

> Wyprowadzone z `context/foundation/prd.md` (v1), `tech-stack.md` oraz automatycznego
> rozpoznania stanu kodu.
> Edycja w miejscu; archiwizacja po zastąpieniu.
> Slice'y poniżej są w kolejności zależności. Tabela "At a glance" jest indeksem.

## Milestone

**M-01: Pełny przepływ priorytetyzacji** — Status: open

- **Intent:** Operator wgrywa plik CSV i dostaje uszeregowaną, wytłumaczalną listę zgłoszeń, a administrator widzi i koryguje wagi reguły z zapisem zmian. To całość pierwszej wersji z PRD — wszystkie dziesięć wymagań koniecznych.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** każde `F-NN` i `S-NN` poniżej ma status `done`.
- **Scope anchors:** FR-001 – FR-010 (wszystkie konieczne), US-01, US-02, US-03.

## Vision recap

Podczas większej awarii kilkanaście zgłoszeń pojawia się naraz, a operator NOC nie ma
jednoznacznej podstawy, którym zająć się pierwszym — dane są dostępne, brakuje reguły
zapisanej w jednym miejscu. Reguła już istnieje w głowach doświadczonych operatorów:
ważona krytyczność plus ważona liczba dotkniętych klientów i usług. Produkt zapisuje ją
i liczy automatycznie, żeby kolejność była szybsza, spójna między zmianami i niezależna
od tego, kto akurat dyżuruje.

Sedno produktu — jedna cecha, bez której narzędzie staje się zwykłym sorterem — to
wytłumaczalność: operator przy każdej pozycji widzi wynik, a po rozwinięciu trzy
składniki, z których powstał. Bez tego wróci do ręcznej analizy.

## North star

**S-01: Operator wgrywa plik CSV i widzi listę zgłoszeń uszeregowaną malejąco po wyliczonym priorytecie** — to dosłownie główne kryterium sukcesu z PRD, więc dopóki ten przepływ nie działa, żadne inne wymaganie nie ma znaczenia.

> Gwiazda przewodnia (north star) znaczy tu: najmniejszy przepływ od końca do końca,
> którego dowiezienie potwierdza, że pomysł na produkt działa. Dlatego stoi tak wcześnie,
> jak pozwalają na to jego wymagania wstępne.

## At a glance

| ID   | Change ID                 | Outcome (user can …)                                                  | Prerequisites | PRD refs                       | Status      |
| ---- | ------------------------- | --------------------------------------------------------------------- | ------------- | ------------------------------ | ----------- |
| F-01 | shared-accounts-and-roles | (foundation) dwa wspólne konta z rozdziałem rol, bez rejestracji      | —             | FR-001, FR-007, Access Control | in-progress |
| F-02 | persisted-weights         | (foundation) wagi reguły żyją trwale w bazie, z RLS pod rozdział kont | F-01          | FR-009, NFR odtwarzalność      | in-progress |
| S-01 | csv-upload-ranked-list    | wgrać CSV i zobaczyć listę uszeregowaną malejąco po priorytecie       | F-01, F-02    | US-01, FR-002, FR-003, FR-004  | proposed    |
| S-02 | score-breakdown           | rozwinąć pozycję i zobaczyć trzy składniki jej wyniku                 | S-01          | US-01, FR-005                  | proposed    |
| S-03 | csv-error-messages        | dostać czytelny komunikat przy niepoprawnym pliku i wgrać poprawiony  | S-01          | US-02, FR-006                  | proposed    |
| S-04 | weights-admin             | zobaczyć obowiązujące wagi i zmienić je tak, że obowiązują trwale     | F-02          | US-03, FR-008, FR-009          | proposed    |
| S-05 | weight-change-history     | zobaczyć historię zmian wag — co i kiedy zmieniono                    | S-04          | US-03, FR-010                  | proposed    |

## Streams

Pomoc w nawigacji — grupuje pozycje dzielące łańcuch wymagań wstępnych. Kolejność
kanoniczna nadal żyje w grafie zależności poniżej; ta tabela to proponowana kolejność
czytania w poprzek równoległych torów.

| Stream | Theme                   | Chain                    | Note                                                                                        |
| ------ | ----------------------- | ------------------------ | ------------------------------------------------------------------------------------------- |
| A      | Konta i trwałość reguły | `F-01` → `F-02`          | Odblokowuje oba pozostałe tory; pod celem `speed` to jedyna praca przed gwiazdą przewodnią. |
| B      | Przepływ operatora      | `S-01` → `S-02` / `S-03` | Zawiera gwiazdę przewodnią; `S-02` i `S-03` idą równolegle po `S-01`.                       |
| C      | Wagi administratora     | `S-04` → `S-05`          | Startuje z `F-02` równolegle do toru B — osobny przebieg agenta może go prowadzić obok.     |

## Baseline

Co jest już w kodzie na `2026-09-28` (rozpoznane automatycznie, potwierdzone przez właściciela).
Fundamenty poniżej zakładają, że to istnieje, i **nie** budują tego ponownie.

- **Frontend:** present — Astro 7 + React 19 + Tailwind 4 + shadcn/ui (`src/components/`, `src/pages/`).
- **Backend / API:** present — trasy plikowe Astro w trybie `server` na adapterze Cloudflare (`src/pages/api/auth/*.ts`).
- **Data:** absent — klient Supabase podłączony (`src/lib/supabase.ts`), ale katalogu `supabase/migrations/` nie ma; zero tabel, zero RLS.
- **Auth:** partial — Supabase Auth, trasy sign-in/up/out, ochrona tras przez `PROTECTED_ROUTES` (`src/middleware.ts:4`). Istnieje jednak rejestracja, której PRD zakazuje, a dwóch wspólnych kont nikt nie zasiał.
- **Deploy / infra:** partial — `wrangler.jsonc` celuje w Cloudflare Workers, CI robi lint/check/build/smoke; wdrożenie jest ręczne (`npx wrangler deploy`), workflow wdrożeniowego nie ma.
- **Observability:** partial — `observability.enabled` w `wrangler.jsonc`; w kodzie aplikacji brak biblioteki logowania czy śledzenia błędów.

## Foundations

### F-01: Dwa wspólne konta z rozdziałem rol

- **Outcome:** (foundation) konto operatorskie i administracyjne istnieją jako konta ustalone z góry, rejestracji nie da się już wywołać, a rola zalogowanego konta jest dostępna przy obsłudze żądania.
- **Change ID:** shared-accounts-and-roles
- **PRD refs:** FR-001, FR-007, `## Access Control`, `## Non-Goals` (brak kont osobowych)
- **Unlocks:** S-01, S-02, S-03, S-04, S-05 (każda historyjka zaczyna się od zalogowanego konta); ścieżka weryfikacji `npm run smoke` po przepisaniu skryptu na logowanie zasianym kontem.
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** — (rozstrzygnięte: CI zasiewa oba konta z `supabase/seed.sql` w lokalnym Supabase, bez sekretów w GitHub Actions; w projekcie chmurowym konta założono ręcznie, a smoke dostaje hasło przez `SMOKE_EMAIL` / `SMOKE_PASSWORD`).
- **Risk:** `scripts/smoke.mjs` i zadanie `smoke` w CI zakładają dziś `/api/auth/signup`; usunięcie rejestracji bez przepisania skryptu w tej samej zmianie wywala CI. Idzie pierwsze, bo bez rozdziału rol nie da się zweryfikować ani jednego wymagania dostępowego.
- **Status:** in-progress (zaimplementowane w PR #8, CI `ci` i `smoke` zielone; czeka na merge i `/10x-archive`)

### F-02: Wagi reguły trwałe, z RLS pod rozdział kont

- **Outcome:** (foundation) wagi krytyczności i mnożniki dla klientów i usług są zapisane w bazie z wartościami startowymi z PRD, czytane przez aplikację przy liczeniu wyniku, a polityki RLS trzymają je poza zasięgiem konta operatorskiego.
- **Change ID:** persisted-weights
- **PRD refs:** FR-009, `## Business Logic` (tabela wag startowych), NFR odtwarzalności rankingu, `## Access Control`
- **Unlocks:** S-01 (liczenie wyniku czyta aktualne wagi, nie stałe w kodzie), S-04 (ekran administratora czyta i zapisuje te wiersze); redukuje ryzyko, że odtwarzalność rankingu zostanie doklejona po fakcie.
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Zakres trzymany na jednej tabeli wag z zasianymi wartościami — historia zmian wchodzi dopiero z S-04, które jej potrzebuje. Gdyby wagi zostały stałymi w kodzie na czas S-01, FR-009 wymagałoby później przepisania liczenia wyniku.
- **Status:** in-progress

## Slices

### S-01: Operator wgrywa CSV i dostaje uszeregowaną listę

- **Outcome:** Operator może wgrać plik CSV ze zgłoszeniami i zobaczyć je jako listę uszeregowaną malejąco po wyliczonym priorytecie, z wynikiem i pozycją przy każdym zgłoszeniu.
- **Change ID:** csv-upload-ranked-list
- **PRD refs:** US-01, FR-002, FR-003, FR-004
- **Prerequisites:** F-01, F-02
- **Parallel with:** S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Kolumny w pliku idą w kolejności `ticket_id, severity, number_of_customers, number_of_services` — klienci **przed** usługami; przestawienie ich nie wywoła błędu, tylko po cichu zmieni każdy wynik. Remisy muszą rozstrzygać się wyższą krytycznością, inaczej wracamy do paraliżu decyzyjnego przy równych wynikach. Idzie pierwsze wśród slice'ów, bo jest gwiazdą przewodnią.
- **Status:** proposed

### S-02: Operator rozwija pozycję i widzi rozbicie wyniku

- **Outcome:** Operator może rozwinąć wybraną pozycję listy i zobaczyć trzy składniki jej wyniku — krytyczność, liczbę dotkniętych klientów i liczbę dotkniętych usług — przy czym lista zwinięta zostaje zwięzła.
- **Change ID:** score-breakdown
- **PRD refs:** US-01, FR-005
- **Prerequisites:** S-01
- **Parallel with:** S-03, S-04, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** To slice, który realizuje guardrail wytłumaczalności — bez niego operator nie sprawdzi, czy ranking ma sens. Pokusa, żeby pokazać rozbicie od razu przy każdej pozycji, robi ścianę danych dokładnie wtedy, gdy operator ma najmniej czasu; PRD rozstrzygnęło to na rzecz rozwijania.
- **Status:** proposed

### S-03: Operator dostaje czytelny komunikat przy niepoprawnym pliku

- **Outcome:** Operator może wgrać plik z brakującą kolumną, pustą komórką lub złym separatorem i zobaczyć komunikat nazywający problem, a potem wgrać poprawiony plik bez ponownego logowania.
- **Change ID:** csv-error-messages
- **PRD refs:** US-02, FR-006
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-04, S-05
- **Blockers:** —
- **Unknowns:**
  - Które przypadki niepoprawnego pliku dostają własny komunikat, a które wspólny — brakująca kolumna, pusta komórka, zły separator, nieznana wartość `severity`, plik pusty? — Owner: user. Block: no.
- **Risk:** Częściowe wgranie jest groźniejsze niż odrzucenie całego pliku — operator mógłby uszeregować niepełną kolejkę, nie wiedząc o tym. Obsługa błędnych plików to praca bez końca, więc zakres trzeba domknąć na przypadkach z US-02.
- **Status:** proposed

### S-04: Administrator widzi i zmienia wagi reguły

- **Outcome:** Administrator może zobaczyć obowiązujące wagi krytyczności oraz mnożniki dla liczby klientów i usług, zmienić wybraną wagę i zapisać ją tak, że obowiązuje przy kolejnym wgraniu pliku, także po restarcie aplikacji, a zmiana zostaje odnotowana.
- **Change ID:** weights-admin
- **PRD refs:** US-03, FR-008, FR-009
- **Prerequisites:** F-02
- **Parallel with:** S-01, S-02, S-03
- **Blockers:** —
- **Unknowns:**
  - Czy wagi mają ograniczony zakres wpisywanych wartości (np. nieujemne, górny limit)? PRD rozważyło brak walidacji i zostawiło FR bez zmian — warto potwierdzić przed planowaniem. — Owner: user. Block: no.
- **Risk:** Zmiana wagi w trakcie awarii przestawiłaby ranking pod operatorem, który już zaczął pracę — dlatego zmiana obowiązuje od następnego wgrania, nie natychmiast. Konto operatorskie nie może dosięgnąć ani odczytu, ani zapisu wag; to RLS z F-02, nie ukrycie przycisku w interfejsie. Ten slice zapisuje wiersze historii, które S-05 tylko wyświetla.
- **Status:** proposed

### S-05: Administrator widzi historię zmian wag

- **Outcome:** Administrator może zobaczyć historię zmian wag — co zostało zmienione i kiedy, ze wskazaniem konta administracyjnego, nie osoby.
- **Change ID:** weight-change-history
- **PRD refs:** US-03, FR-010
- **Prerequisites:** S-04
- **Parallel with:** S-01, S-02, S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Historia bez zapisanej zmiany to pusty ekran, dlatego idzie po S-04, nie przed. Ślad dotyczy konta i czasu — wskazanie osoby byłoby audytem personalnym, który PRD wyklucza. Ostatni w kolejności wśród wymagań koniecznych: jest wymagany, ale nie blokuje niczego innego.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                 | Suggested issue title                                    | Ready for `/10x-plan` | Notes                                           |
| ---------- | ------------------------- | -------------------------------------------------------- | --------------------- | ----------------------------------------------- |
| F-01       | shared-accounts-and-roles | Dwa wspólne konta, usunięcie rejestracji, rola w żądaniu | done                  | #1 · Zaimplementowane w PR #8; czeka na merge   |
| F-02       | persisted-weights         | Trwałe wagi reguły priorytetu z politykami RLS           | no                    | #2 · Czeka na merge F-01 (PR #8)                |
| S-01       | csv-upload-ranked-list    | Wgranie CSV i lista uszeregowana po priorytecie          | no                    | #3 · Gwiazda przewodnia; czeka na F-01, F-02    |
| S-02       | score-breakdown           | Rozbicie wyniku po rozwinięciu pozycji                   | no                    | #4 · Czeka na S-01                              |
| S-03       | csv-error-messages        | Czytelne komunikaty dla niepoprawnego pliku CSV          | no                    | #5 · Czeka na S-01                              |
| S-04       | weights-admin             | Podgląd i edycja wag z konta administracyjnego           | no                    | #6 · Czeka na F-02; może iść równolegle do S-01 |
| S-05       | weight-change-history     | Historia zmian wag                                       | no                    | #7 · Czeka na S-04                              |

## Open Roadmap Questions

1. **Czy wdrożenie na produkcję przed 2026-11-04 zostaje ręczne (`npm run build` + `npx wrangler deploy`), czy potrzebny jest workflow wdrożeniowy?** — Owner: user. Block: nie blokuje żadnego slice'a; dotyczy samego uruchomienia. `tech-stack.md` zakłada automatyczne wdrożenie po merge, a w repo takiego workflow nie ma.

(PRD nie ma nierozstrzygniętych pytań otwartych — to pytanie wyszło z rozpoznania stanu kodu, nie z dokumentu.)

## Parked

- **Integracja z systemem obsługi zgłoszeń / ITSM** — Why parked: PRD §Non-Goals; jedynym wejściem pierwszej wersji jest plik CSV.
- **Operacje na zgłoszeniach (zamykanie, przypisywanie, komentowanie, ręczne nadpisanie priorytetu)** — Why parked: PRD §Non-Goals; to system priorytetyzacji, nie system ticketowy.
- **Trwałość wgranych zgłoszeń i historia wgrań** — Why parked: PRD §Non-Goals; trwałość obejmuje wyłącznie wagi, historię ich zmian i konta.
- **Grupowanie zgłoszeń z jednej awarii** — Why parked: PRD §Non-Goals; kilkanaście zgłoszeń zostaje kilkunastoma pozycjami listy.
- **Dostępność niezależna od infrastruktury objętej awarią** — Why parked: PRD §Non-Goals; decyzja podjęta świadomie podczas kształtowania.
- **Konfigurowalność dla innych organizacji** — Why parked: PRD §Non-Goals; jedna skala krytyczności, jeden format pliku, wagi pod jedną sieć.
- **Konta osobowe i audyt logowań** — Why parked: PRD §Non-Goals; dwa wspólne konta, ślad tylko przy edycji wag.
- **Wersjonowanie wag i odtwarzanie starszych rankingów** — Why parked: PRD §Non-Goals; historia zmian uznana za wystarczającą.
- **Biblioteka logowania / śledzenia błędów w aplikacji** — Why parked: cel `speed` i brak wymagania w PRD; `observability` Workers jest włączone, to wystarcza na pierwszą wersję.
- **Workflow automatycznego wdrożenia** — Why parked: ręczne `npx wrangler deploy` działa; patrz `## Open Roadmap Questions` pkt 1.

## Milestone History

(Pusta — M-01 jest pierwszym kamieniem milowym.)

## Done

(Pusta na pierwszej generacji. `/10x-archive` dopisuje tu pozycję i przestawia status na `done`, gdy zmiana o pasującym `Change ID` zostaje zarchiwizowana.)
