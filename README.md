# ⚽ Puchar Felka — tabela turnieju

Strona z tabelą turnieju piłkarskiego dla dzieci, z **edycją wyników na żywo**
w przeglądarce i synchronizacją u wszystkich widzów bez odświeżania. Dane
przechowywane są w **MongoDB**, a całość uruchamiasz jednym poleceniem przez
**Docker**.

Obsługiwane formaty turnieju:
- **Grupy** — „każdy z każdym", tabela liczona automatycznie.
- **Puchar (8 osób)** — ćwierćfinały → półfinały → finał + mecz o 3. miejsce,
  z automatycznym awansem zwycięzców.

---

## 🚀 Uruchomienie (Docker — zalecane)

Wymagany **Docker** z wtyczką Compose.

```bash
docker compose up --build
```

Aplikacja: **http://localhost:3000**. W tej samej sieci Wi-Fi otworzysz ją na
innych urządzeniach pod adresem LAN (np. `http://192.168.1.20:3000`).

Compose uruchamia dwa kontenery: aplikację oraz **MongoDB** (z trwałym
wolumenem `mongo-data`). Port bazy **nie jest** wystawiany na zewnątrz — sięga
po nią tylko aplikacja.

Zatrzymanie: `Ctrl + C`, a sprzątnięcie kontenerów: `docker compose down`
(dodaj `-v`, aby skasować też dane w bazie).

---

## 🧑‍💻 Uruchomienie lokalne (bez Dockera)

Wymaga **Node.js ≥ 18** i działającej instancji **MongoDB**.

```bash
npm install
MONGODB_URI=mongodb://127.0.0.1:27017 node server.js   # lub: npm start
```

Przy pierwszym starcie, gdy baza jest pusta, aplikacja zakłada pusty turniej —
resztę tworzysz przez interfejs.

---

## ✏️ Edycja na żywo (w przeglądarce)

1. Kliknij **„Tryb edycji"** w prawym górnym rogu.
2. Podaj **PIN** (domyślnie `felek` — zmienisz go w `config.json` lub zmienną `EDIT_PIN`).
3. Możesz teraz:
   - zmieniać nazwę turnieju, rok i podtytuł,
   - **przełączyć tryb turnieju** (Grupy ↔ Puchar 8 osób) w „Nazwa / opis turnieju",
   - w trybie grupowym: dodawać/usuwać grupy i drużyny, wpisywać wyniki
     (tabela przelicza się sama), generować mecze „każdy z każdym",
   - w trybie pucharowym: wpisać nazwy 8 zawodników i wyniki meczów —
     zwycięzcy awansują automatycznie aż do finału.

Zmiany **zapisują się automatycznie**. Każdy, kto ogląda tabelę na innym
urządzeniu, zobaczy aktualizację **od razu** — bez odświeżania strony.

---

## 🔁 Live-reload plików źródłowych

Podczas pracy nad wyglądem możesz edytować pliki w `public/`
(`index.html`, `style.css`, `app.js`). Po zapisaniu pliku **strona w przeglądarce
odświeży się sama**.

---

## 🗂️ Struktura projektu

```
puchar-felka/
├─ server.js            # serwer HTTP/SSE + statyczne pliki + API
├─ db.js                # warstwa danych MongoDB (schemat znormalizowany)
├─ config.json          # port i PIN edycji
├─ package.json
├─ Dockerfile
├─ docker-compose.yml   # aplikacja + MongoDB
├─ data/
│  └─ images/logo.png   # logo w nagłówku (serwowane pod /logo.png)
└─ public/
   ├─ index.html
   ├─ style.css
   └─ app.js
```

Dane turnieju trzymane są w **MongoDB** (kolekcje `tournaments`, `groups`,
`teams`, `matches`; ostatnie 20 migawek w kolekcji `backups`).

---

## ⚙️ Konfiguracja

`config.json`:

```json
{
  "port": 3000,
  "editPin": "felek"
}
```

Zmienne środowiskowe nadpisują plik (przydatne w Dockerze):

| Zmienna        | Domyślnie                     | Opis                                         |
| -------------- | ----------------------------- | -------------------------------------------- |
| `PORT`         | `3000`                        | Port serwera.                                |
| `EDIT_PIN`     | `felek`                       | PIN edycji. Pusty (`""`) wyłącza ochronę.    |
| `MONGODB_URI`  | `mongodb://127.0.0.1:27017`   | Adres MongoDB.                               |
| `MONGODB_DB`   | `puchar_felka`                | Nazwa bazy.                                  |

> Ochrona PIN-em jest celowo lekka — przeznaczona do zaufanej sieci lokalnej,
> a nie do publicznego internetu.

---

## 🧮 Jak liczona jest tabela (tryb grupowy)

Punkty: **wygrana 3 / remis 1 / porażka 0** (do zmiany w ustawieniach).
Kolejność: **punkty → różnica bramek → bramki zdobyte → nazwa**.
Drużyny na pozycjach awansu są oznaczone zielonym paskiem.
