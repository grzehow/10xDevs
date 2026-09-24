---
project: "NOC Priority"
context_type: greenfield
created: 2026-09-18
updated: 2026-09-21
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 6
  hard_deadline: 2026-11-04
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "rodzaj bólu"
      decision: "paraliż decyzyjny — dane istnieją, brak podstawy do jednoznacznego wyboru kolejności"
    - topic: "insight"
      decision: "reguła priorytetu istnieje w głowach doświadczonych operatorów, nie jest zapisana"
    - topic: "zakres persony"
      decision: "operator NOC w organizacji użytkownika (jedna sieć, jeden zespół)"
    - topic: "eskalacje klienta/menedżera"
      decision: "poza MVP — aplikacja liczy tylko rekomendowany priorytet z danych z CSV"
    - topic: "model dostępu"
      decision: "SUPERSEDED (faza 2 → faza 7): logowanie z kontem na osobę; obowiązuje 'kształt kont po rozszerzeniu'"
    - topic: "role"
      decision: "dwie role — operator (CSV + lista) i administrator wag (wagi i parametry reguły)"
    - topic: "budżet pierwszego przepływu"
      decision: "SUPERSEDED (faza 3 → faza 7): 3 tygodnie bez ekranu wag; obowiązuje 'budżet po rozszerzeniu'"
    - topic: "źródło wag krytyczności w v1"
      decision: "SUPERSEDED (faza 3 → faza 7): wagi w konfiguracji; obowiązuje edycja wag w MVP"
    - topic: "kryterium Secondary"
      decision: "brak — usunięte, bo wymaga trwałości danych, której v1 nie ma"
    - topic: "trwałość danych"
      decision: "SUPERSEDED (faza 4 → faza 7): brak trwałości; obowiązuje 'zakres trwałości' — trwałe są wagi, historia zmian i konta"
    - topic: "operacje na zgłoszeniach"
      decision: "brak — lista tylko do odczytu; to system priorytetyzacji, nie system ticketowy"
    - topic: "zakres uzasadnienia score'u"
      decision: "lista zwięzła; rozbicie na trzy składniki po rozwinięciu pozycji (zmiana po rundzie sokratejskiej)"
    - topic: "remisy w rankingu"
      decision: "przy równym wyniku wyżej idzie zgłoszenie o wyższej krytyczności alarmu źródłowego"
    - topic: "kształt reguły priorytetu"
      decision: "suma ważona trzech składników: krytyczność + liczba usług + liczba klientów"
    - topic: "skala krytyczności"
      decision: "Critical / Major / Minor / Warning"
    - topic: "właściwości jakościowe"
      decision: "czas wyniku < 3 s, odtwarzalność rankingu, dane klientów nie opuszczają środowiska; dostępność w trakcie awarii sieci odrzucona dla v1"
    - topic: "rodzaj produktu"
      decision: "aplikacja webowa"
    - topic: "skala użytkowników"
      decision: "jeden zespół NOC — kilka osób"
    - topic: "termin i tryb pracy"
      decision: "twardy termin 2026-11-04; praca po godzinach, ~4 h/tydzień"
    - topic: "non-goale"
      decision: "brak integracji ITSM, brak operacji na zgłoszeniach, brak dostępności niezależnej od awarii, brak konfigurowalności dla innych organizacji, brak kont osobowych, brak grupowania zgłoszeń z jednej awarii"
    - topic: "kształt logowania"
      decision: "SUPERSEDED (faza 4 → faza 7): jedno wspólne konto, jedna rola; obowiązują dwa wspólne konta i dwie role"
    - topic: "rozszerzenie zakresu MVP (po fazie 7)"
      decision: "ekran edycji wag, rola administratora i trwałość wag wchodzą do MVP"
    - topic: "kształt kont po rozszerzeniu"
      decision: "dwa wspólne konta — operatorskie i administracyjne; bez kont osobowych"
    - topic: "ślad zmian"
      decision: "historia tylko dla zmian wag (konto + czas, nie osoba); bez audytu wgrań i logowań"
    - topic: "zakres trwałości"
      decision: "trwałe są wagi, historia ich zmian i konta; wgrane zgłoszenia nadal giną po sesji"
    - topic: "budżet po rozszerzeniu"
      decision: "6 tygodni, koszt przyjęty jawnie"
    - topic: "wartości wag"
      decision: "warning 1.0, minor 5.0, major 10.0, critical 15.0; klient 3.0, usługa 1.0; wynik 58 ze szkicu wycofany jako poglądowy"
    - topic: "kontrakt pliku CSV"
      decision: "kolumny ticket_id, severity, number_of_customers, number_of_services; nagłówek obecny, separator przecinek, UTF-8, severity małymi literami"
    - topic: "zakres progu wydajnościowego"
      decision: "poniżej 3 s dla plików do 200 zgłoszeń (cały realny zakres)"
    - topic: "wolumen"
      decision: "10–200 zgłoszeń w pliku, 10–100 plików na dobę"
    - topic: "odtwarzalność starszych rankingów"
      decision: "historia zmian wag wystarcza; wersjonowanie wag niepotrzebne"
  frs_drafted: 10
  quality_check_status: accepted
---

# Shape notes

Pomysł wejściowy (zapisany dosłownie): narzędzie do priorytetyzacji zgłoszeń w NOC.
Operator dostaje wiele zgłoszeń i nie wie, które obsłużyć pierwsze. Aplikacja wylicza
priorytet z wpływu biznesowego i pilności: krytyczność wyliczona ze źródłowych alarmów
sieciowych oraz liczba dotkniętych usług klienckich (więcej = pilniejsze). Wejście: plik
CSV. Integracja z ITSM jest poza zakresem MVP (rozważana później). Liczba klientów
i usług jest mała.

## Vision & Problem Statement

Podczas większej awarii sieciowej w krótkim czasie pojawia się kilka lub kilkanaście
nowych zgłoszeń powiązanych z alarmami z różnych elementów sieci. Operator NOC widzi
listę ticketów, ale nie ma jednoznacznej informacji, które zgłoszenie ma największy
wpływ biznesowy. Obecnie analizuje je ręcznie: sprawdza krytyczność alarmów źródłowych,
liczbę dotkniętych usług oraz klientów, porównuje informacje w różnych systemach lub
konsultuje się z bardziej doświadczonym kolegą. Kolejność bywa dodatkowo przestawiana
eskalacją od klienta lub menedżera. Koszt: operator może rozpocząć analizę mniej
istotnego problemu, gdy w tym samym czasie inne zgłoszenie dotyka większej liczby
klientów lub usług o wyższym znaczeniu biznesowym. W efekcie wydłuża się czas reakcji
na najważniejsze incydenty, rośnie liczba eskalacji, a klienci dłużej odczuwają skutki
awarii. Decyzje o kolejności zależą od doświadczenia konkretnego operatora, co powoduje
brak spójności pomiędzy zmianami i członkami zespołu.

Insight: reguła priorytetu już istnieje — doświadczeni operatorzy liczą ją intuicyjnie
z krytyczności alarmów oraz liczby dotkniętych usług i klientów — ale nigdzie nie jest
zapisana. Wartością produktu jest zapisanie tej reguły i wyliczanie jej automatycznie,
tak aby operator od razu widział, które zgłoszenia obsłużyć w pierwszej kolejności,
a proces stał się szybszy, bardziej spójny i mniej zależny od indywidualnego
doświadczenia. Rodzaj bólu: paraliż decyzyjny — dane są dostępne, brakuje podstawy
do jednoznacznego wyboru kolejności.

## User & Persona

Operator NOC w organizacji użytkownika — konkretna rola w konkretnym zespole, jedna
sieć. Sięga po narzędzie w pierwszych minutach większej awarii sieciowej, gdy kolejka
zgłoszeń rośnie naraz i trzeba zdecydować, za co zabrać się pierwsze. Wagi i reguły
mogą być dopasowane do tej jednej sieci; narzędzie nie musi być konfigurowalne dla
innych organizacji.

## Success Criteria

### Primary

- Operator wgrywa plik CSV i widzi listę zgłoszeń posortowaną malejąco po wyliczonym
  priorytecie, a po rozwinięciu wybranej pozycji jej uzasadnienie (severity, liczba
  dotkniętych usług, liczba dotkniętych klientów).
- Droga od wgrania pliku do rozpoczęcia analizy najważniejszego zgłoszenia mieści się
  poniżej minuty — wobec kilku minut ręcznej analizy dziś (miara wyprowadzona
  ze szkicu przepływu operatora: 09:13 logowanie → 09:14:10 start analizy).
- Wybór kolejności nie wymaga porównywania danych w innych systemach ani konsultacji
  z bardziej doświadczonym kolegą.
- Administrator zmienia wagę reguły, zmiana zostaje zapamiętana i obowiązuje przy
  kolejnych wgraniach pliku — także po ponownym uruchomieniu aplikacji.

### Secondary

- Brak. Przepływ główny sam w sobie jest celem pierwszej wersji. Ręczne nadpisanie
  priorytetu z uzasadnieniem zostało usunięte i pozostaje non-goalem — aplikacja nie
  wykonuje żadnych operacji na zgłoszeniach.

### Guardrails

- Wyliczony priorytet musi być wytłumaczalny — operator zawsze widzi, z czego wynikła
  liczba. Bez tego nie zaufa rekomendacji i wróci do ręcznej analizy.
- Błędny lub niekompletny plik CSV (brakująca kolumna, pusta komórka, zły separator)
  kończy się czytelnym komunikatem, nie utratą całego wgrania. W trakcie awarii nie ma
  czasu na debugowanie narzędzia.
- Nazwy klientów i usług nie opuszczają kontrolowanego środowiska — żadna usługa
  zewnętrzna ich nie otrzymuje.

## User Stories

### US-01: Operator poznaje kolejność obsługi zgłoszeń po wgraniu pliku

- **Given** zalogowany operator i plik CSV z kilkoma zgłoszeniami powiązanymi z jedną awarią
- **When** wgrywa ten plik
- **Then** widzi listę zgłoszeń posortowaną malejąco po wyliczonym priorytecie i może
  rozwinąć dowolną pozycję, żeby zobaczyć rozbicie wyniku na severity, liczbę
  dotkniętych usług i liczbę dotkniętych klientów

#### Acceptance Criteria

- Pozycja na szczycie listy to zgłoszenie z najwyższym wyliczonym priorytetem
- Lista jest zwięzła (identyfikator, wynik, kolejność); trzy składniki wyniku pokazują
  się po rozwinięciu wybranej pozycji
- Dwa zgłoszenia z identycznym wynikiem mają jednoznaczną kolejność wynikającą z reguły
  rozstrzygania remisów
- Po zamknięciu sesji lista nie jest odtwarzana — operator wgrywa plik ponownie
- Operator nie wykonuje żadnej operacji na zgłoszeniach; lista jest tylko do odczytu

### US-02: Operator dostaje czytelny komunikat przy niepoprawnym pliku

- **Given** zalogowany operator
- **When** wgrywa plik CSV z brakującą kolumną, pustą komórką lub złym separatorem
- **Then** widzi komunikat wskazujący problem, a nie pustą listę ani utratę całego wgrania

#### Acceptance Criteria

- Komunikat nazywa problem z plikiem, nie ogólną awarię aplikacji
- Operator może wgrać poprawiony plik bez ponownego logowania

### US-03: Administrator zmienia wagę reguły priorytetu

- **Given** osoba zalogowana kontem administracyjnym
- **When** zmienia wagę krytyczności albo mnożnik dla liczby usług lub klientów i zapisuje zmianę
- **Then** nowa waga obowiązuje przy kolejnym wgraniu pliku, a zmiana pojawia się
  w historii zmian wag

#### Acceptance Criteria

- Zapisana waga obowiązuje także po ponownym uruchomieniu aplikacji
- Historia zmian pokazuje, co zostało zmienione i kiedy; nie wskazuje osoby, tylko konto
- Konto operatorskie nie ma dostępu do ekranu wag ani do historii ich zmian

## Functional Requirements

### Przepływ operatora

- FR-001: Operator może zalogować się wspólnym kontem operatorskim. Priority: must-have

  > Socrates: Rozważone kontrargumenty: wspólne konto nie chroni realnie niczego;
  > logowanie kosztuje sekundy w trakcie awarii; bez trwałych danych ekran logowania
  > jest dekoracją. Rozstrzygnięcie: brak kontrargumentu — FR zostaje jak napisane.

- FR-002: Operator może wgrać plik CSV ze zgłoszeniami. Priority: must-have

  > Socrates: Rozważone kontrargumenty: ręczny eksport z innego systemu to ta sama
  > praca co dziś; zmienny format eksportu może zjeść budżet projektu; plik jest
  > zdjęciem przeszłości, a zgłoszenia dochodzą w trakcie awarii.
  > Rozstrzygnięcie: brak kontrargumentu — FR zostaje jak napisane.

- FR-003: Operator może zobaczyć wyliczony priorytet dla każdego wgranego zgłoszenia. Priority: must-have

  > Socrates: Kontrargument przyjęty jako najmocniejszy: operator potrzebuje tylko
  > wiedzieć, co obsłużyć pierwsze, więc wynik dla pozostałych pozycji to informacja,
  > której nie użyje. Rozstrzygnięcie: FR zostaje bez zmian — guardrail
  > wytłumaczalności wymaga widocznego wyniku przy każdej pozycji; bez tego operator
  > nie sprawdzi, czy ranking ma sens, i wróci do ręcznej analizy.

- FR-004: Operator może zobaczyć listę zgłoszeń posortowaną malejąco po priorytecie. Priority: must-have

  > Socrates: Kontrargument przyjęty jako najmocniejszy: dwa zgłoszenia z identycznym
  > wynikiem wracają do paraliżu decyzyjnego, a przy małej liczbie klientów i usług
  > remisy będą częste. Rozstrzygnięcie: FR zostaje, ale reguła priorytetu musi
  > zawierać rozstrzyganie remisów — dokładny kształt ustalany w fazie 5.

- FR-005: Operator może rozwinąć pozycję listy i zobaczyć, z czego składa się jej priorytet (severity, liczba dotkniętych usług, liczba dotkniętych klientów). Priority: must-have

  > Socrates: Kontrargument przyjęty jako najmocniejszy: rozbicie widoczne od razu przy
  > każdej z kilkunastu pozycji to ściana danych dokładnie wtedy, gdy operator ma
  > najmniej czasu na czytanie. Rozstrzygnięcie: FR zmienione — lista pozostaje zwięzła
  > (identyfikator, wynik, kolejność), a trzy składniki pokazują się po rozwinięciu
  > wybranej pozycji. Guardrail wytłumaczalności zostaje spełniony bez zagęszczania
  > ekranu.

- FR-006: Operator może zobaczyć czytelny komunikat, gdy pliku nie da się przetworzyć. Priority: must-have
  > Socrates: Rozważone kontrargumenty: obsługa błędnych plików to praca bez końca;
  > komunikat nie pomoże, gdy plik przychodzi z innego systemu; częściowe wgranie jest
  > groźniejsze niż odrzucenie całego pliku. Rozstrzygnięcie: brak kontrargumentu —
  > FR zostaje jak napisane.

### Zarządzanie wagami reguły

- FR-007: Administrator może zalogować się wspólnym kontem administracyjnym. Priority: must-have

  > Socrates: Rozważone kontrargumenty: drugie wspólne konto to iluzja rozdziału, bo
  > hasło trafi do tych samych ludzi; osobne konto jest barierą w trakcie awarii;
  > wagi zmienia się rzadko, więc konto nie ma odbiorcy.
  > Rozstrzygnięcie: brak kontrargumentu — FR zostaje jak napisane.

- FR-008: Administrator może zobaczyć obowiązujące wagi — krytyczności Critical / Major / Minor / Warning oraz mnożniki dla liczby usług i liczby klientów. Priority: must-have

  > Socrates: Rozważone kontrargumenty: widoczne wagi zapraszają do dryfu reguły
  > i psują porównywalność rankingów między tygodniami; wagi bez symulacji skutku
  > nie mówią adminowi, co zmieni; widok liczb bez wzoru nie tłumaczy wyniku.
  > Rozstrzygnięcie: brak kontrargumentu — FR zostaje jak napisane.

- FR-009: Administrator może zmienić wagę i zapisać ją tak, że obowiązuje przy kolejnych wgraniach pliku oraz po ponownym uruchomieniu aplikacji. Priority: must-have

  > Socrates: Rozważone kontrargumenty: zmiana wagi w trakcie awarii przestawia ranking
  > pod operatorem, który już zaczął pracę; brak walidacji zakresu pozwala wpisać wagę
  > czyniącą ranking bezsensownym; trwałe wagi bez wersjonowania uniemożliwiają
  > odtworzenie starszego rankingu.
  > Rozstrzygnięcie: brak kontrargumentu — FR zostaje jak napisane.

- FR-010: Administrator może zobaczyć historię zmian wag — co zostało zmienione i kiedy. Priority: must-have
  > Socrates: Rozważone kontrargumenty: historia bez uzasadnienia nie odpowiada na
  > pytanie „dlaczego", które zadaje się po awarii; historia bez cofania zmiany jest
  > tylko archiwum; przy kilku zmianach w roku ekran pozostanie pusty i zapomniany.
  > Rozstrzygnięcie: brak kontrargumentu — FR zostaje jak napisane.

## Non-Functional Requirements

- Dla pliku o dowolnym realnym rozmiarze — do 200 zgłoszeń — operator widzi wyliczoną
  kolejność w czasie poniżej 3 sekund od wgrania. Próg obowiązuje dla całego zakresu,
  łącznie z największym plikiem.
- Powtórzone wgranie tego samego pliku przy niezmienionych wagach daje identyczną
  kolejność i identyczne wyniki — ranking jest odtwarzalny, więc decyzję operatora można
  obronić po zakończeniu awarii. Po zmianie wag odtwarzalność obowiązuje względem wag
  aktualnych, a historia zmian wag pozwala ustalić, które obowiązywały wcześniej.
- Nazwy klientów i usług z wgranego pliku nie trafiają do żadnej usługi zewnętrznej.

Dostępność narzędzia w trakcie awarii sieci nie została przyjęta jako wymaganie
pierwszej wersji.

## Business Logic

Aplikacja ustawia kolejność obsługi zgłoszeń, sumując ważoną krytyczność alarmu
źródłowego z ważoną liczbą dotkniętych usług i ważoną liczbą dotkniętych klientów,
a przy równym wyniku stawiając wyżej zgłoszenie o wyższej krytyczności.

Wejścia reguły pochodzą z wgranego pliku i są dla operatora czytelne bez tłumaczenia:
krytyczność alarmu źródłowego w skali Critical / Major / Minor / Warning, liczba
dotkniętych usług klienckich oraz liczba dotkniętych klientów. Każde z trzech wejść ma
przypisaną wagę. Wagi są przechowywane trwale i edytowalne z konta administracyjnego;
operator ich nie zmienia. Zmiana wagi obowiązuje od następnego wgrania pliku, a każda
zmiana zostaje odnotowana w historii zmian wag.

Wagi startowe pierwszej wersji:

| Wejście                | Waga |
| ---------------------- | ---- |
| Krytyczność `warning`  | 1.0  |
| Krytyczność `minor`    | 5.0  |
| Krytyczność `major`    | 10.0 |
| Krytyczność `critical` | 15.0 |
| Każdy dotknięty klient | 3.0  |
| Każda dotknięta usługa | 1.0  |

Wynik = waga krytyczności + 3.0 × liczba klientów + 1.0 × liczba usług. Przykład
z rzeczywistego wiersza danych (`INC00013, major, 2 klientów, 5 usług`):
`10.0 + 2 × 3.0 + 5 × 1.0 = 21.0`. Klient waży trzy razy więcej niż usługa — to
świadoma decyzja: liczy się zasięg biznesowy, nie liczba dotkniętych elementów sieci.

Kontrakt techniczny pliku wejściowego (nazwy kolumn, separator, kodowanie) jest zapisany
w bloku `## Forward: input-format` — nie należy do PRD.

Wyjściem jest jeden wynik liczbowy dla każdego zgłoszenia oraz wynikająca z niego
pozycja w kolejności. Operator spotyka się z regułą bezpośrednio po wgraniu pliku:
widzi listę uszeregowaną malejąco po wyniku, a po rozwinięciu wybranej pozycji trzy
składniki, z których ten wynik powstał. Suma ważona została wybrana właśnie dlatego, że
rozbicie na składniki tłumaczy wynik bez dodatkowego wyjaśniania — a wytłumaczalność
jest guardrailem tego produktu.

Notatka o skali (z rundy sokratejskiej fazy 6): przy stukrotnie większej liczbie
użytkowników wagi musiałyby być konfigurowalne per zespół lub organizację, bo każda sieć
ma inny profil krytyczności. To pierwsze założenie, które pękłoby przy wzroście.
W pierwszej wersji wagi są wspólne dla całego zespołu i edytowalne z jednego konta
administracyjnego.

Remisy rozstrzyga wyższa krytyczność alarmu źródłowego, co nie wymaga żadnej dodatkowej
kolumny w pliku poza tymi, których reguła już używa.

## Access Control

Dwa wspólne konta, bez kont osobowych:

- **Konto operatorskie** — jedno wejście dla całego NOC. Wgrywa plik CSV i czyta
  wyliczoną, posortowaną listę. Nie wykonuje operacji na zgłoszeniach i nie widzi
  ekranu wag.
- **Konto administracyjne** — dodatkowo widzi i zmienia wagi krytyczności oraz mnożniki
  dla liczby usług i liczby klientów, a także historię zmian wag.

Rozdział uprawnień działa, śladu personalnego nie ma: historia zmian wag wskazuje, że
zmiany dokonano z konta administracyjnego i kiedy, ale nie wskazuje osoby. To
zabezpieczenie zmiany, nie audyt personalny.

Niezalogowany użytkownik nie ma dostępu do wgrywania pliku, do listy zgłoszeń ani do wag.

## Non-Goals

Funkcjonalne:

- **Brak integracji z systemem obsługi zgłoszeń / ITSM** — jedynym wejściem jest plik
  CSV. Integracja jest rozważana po pierwszej wersji.
- **Brak operacji na zgłoszeniach** — żadnego zamykania, przypisywania, komentowania
  ani ręcznego nadpisywania priorytetu. To system priorytetyzacji, nie system ticketowy.

Niefunkcjonalne:

- **Brak dostępności niezależnej od infrastruktury objętej awarią** — narzędzie nie
  musi działać, gdy padnie środowisko, w którym jest uruchomione. Decyzja podjęta
  świadomie w fazie 5.
- **Brak konfigurowalności dla innych organizacji** — jedna skala krytyczności, jeden
  format pliku, wagi dopasowane do tej jednej sieci.
- **Brak kont osobowych** — dwa wspólne konta (operatorskie i administracyjne). Historia
  zmian wag wskazuje konto i czas, nie osobę. Brak audytu wgrań i logowań; ślad dotyczy
  wyłącznie edycji wag.
- **Brak grupowania zgłoszeń z jednej awarii** — kilkanaście zgłoszeń z jednego
  zdarzenia zostaje kilkunastoma osobnymi pozycjami listy.

Trwałość obejmuje wyłącznie wagi, historię ich zmian i konta. Wgrane zgłoszenia nadal
giną po sesji — przechowywanie zgłoszeń i historia wgrań pozostają kandydatem na drugą
wersję, nie zostały jednak zamknięte jako non-goal.

## Open Questions

_Rozstrzygnięte w trakcie sesji_: rola administratora wag wchodzi do pierwszej wersji
wraz z edycją wag i trwałością wag (decyzja z fazy 7; odwraca wcześniejsze ustalenie,
że wagi pozostaną w konfiguracji).

_Rozstrzygnięte 2026-09-21_:

- **Wartości liczbowe wag** — podane i zapisane w `## Business Logic`. Wynik 58 ze szkicu
  przepływu okazał się poglądowy i został wycofany jako liczba odniesienia; przy
  przyjętych wagach ten sam przypadek (`major`, 12 usług, 8 klientów) daje 46.
- **Nazwy i format kolumn CSV** — podane i zapisane w `## Business Logic`.
- **Zakres wymagania wydajnościowego** — próg 3 s obowiązuje dla plików do 200 zgłoszeń.
- **Odtwarzalność starszych rankingów** — historia zmian wag wystarcza; wersjonowanie
  wag nie jest potrzebne.

Brak nierozstrzygniętych pytań otwartych.

---

## Forward: input-format

Blok informacyjny dla kroków po PRD (wybór stacku, planowanie implementacji). To kontrakt
techniczny pliku wejściowego, nie wymaganie produktowe — dlatego nie trafia do PRD.

- Kolumny, w tej kolejności: `ticket_id`, `severity`, `number_of_customers`,
  `number_of_services`. Klienci **przed** usługami — łatwo pomylić przy parsowaniu.
- Pierwszy wiersz to nagłówek z nazwami kolumn.
- Separator: przecinek. Kodowanie: UTF-8.
- Wartości `severity` przychodzą małymi literami: `critical`, `major`, `minor`, `warning`.
- Przykładowy wiersz danych: `INC00013,major,2,5` (2 klientów, 5 usług → wynik 21.0).
- Wolumen: 10–200 zgłoszeń w pliku, 10–100 plików na dobę.

## Quality cross-check

Przebieg: 2026-09-21, status `accepted`. Wszystkie elementy bramki obecne — kontrola
dostępu, reguła biznesowa w jednym zdaniu, artefakt sesji, jawnie przyjęty koszt
czasowy, non-goale. Sprawdzenie zachowania zachowanego nie dotyczy sesji greenfield.

Bez luk bramki.

Aktualizacja 2026-09-21 (po odpowiedzi na pytania otwarte): oba pytania blokujące
zostały rozstrzygnięte — wartości wag oraz kontrakt pliku CSV są zapisane
w `## Business Logic`. Doprecyzowano też wolumen danych i zakres progu wydajnościowego.
Blok `## Open Questions` nie zawiera już nierozstrzygniętych pozycji.

## Timeline acknowledgment

Acknowledged on 2026-09-21: 6-tygodniowe MVP wymaga nieprzerwanej pracy po godzinach;
użytkownik jawnie przyjął ten koszt.

Pierwotny budżet wynosił 3 tygodnie (~12 h) i był policzony na przepływ bez trwałości
danych i bez drugiej roli. Rozszerzenie zakresu o ekran edycji wag, konto
administracyjne, trwałość wag i historię ich zmian podniosło budżet do 6 tygodni przy
około 4 godzinach tygodniowo (~24 h). Twardy termin 2026-11-04 oznacza około 6,5 tygodnia
od 2026-09-21, czyli praktycznie brak zapasu na poprawki. Praca po godzinach.

Kosztowne elementy dodane w tym rozszerzeniu: trwałe przechowywanie wag, ekran edycji
z walidacją, rozdział uprawnień między dwoma kontami, historia zmian wag, testy dla obu
ról.
