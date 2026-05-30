# ⚽ Puchar Felka 2016 — tabela turnieju

Statyczna strona z tabelą turnieju piłkarskiego dla dzieci, hostowana przez Node.js
w sieci lokalnej, z **edycją wyników na żywo** w przeglądarce oraz **live-reload**
plików źródłowych podczas pracy.

Brak zewnętrznych zależności — wystarczy zainstalowany **Node.js (≥ 16)**.

---

## 🚀 Uruchomienie

1. Zainstaluj Node.js (jeśli nie masz): https://nodejs.org
2. W terminalu wejdź do folderu projektu i uruchom:

   ```bash
   node server.js
   ```

   (lub `npm start`)

3. W konsoli pojawią się adresy, np.:

   ```
   Lokalnie:     http://localhost:3000
   W sieci LAN:  http://192.168.1.20:3000
   ```

4. Otwórz adres `localhost` na tym komputerze, a adres **LAN** na innych
   urządzeniach (telefony, tablety, drugi laptop) podłączonych do **tej samej sieci Wi‑Fi**.

> Aby zmienić port: `PORT=8080 node server.js` lub edytuj `config.json`.

---

## ✏️ Edycja na żywo (w przeglądarce)

1. Kliknij **„Tryb edycji"** w prawym górnym rogu.
2. Podaj **PIN** (domyślnie `felek` — zmienisz go w pliku `config.json`).
3. Możesz teraz:
   - zmieniać nazwę turnieju, rok i podtytuł (w nagłówku),
   - dodawać / usuwać / zmieniać nazwy **grup** i **drużyn**,
   - **wpisywać wyniki meczów** — tabela przelicza się automatycznie,
   - wygenerować mecze „każdy z każdym" jednym kliknięciem,
   - ustawić, ile drużyn awansuje z grupy (przycisk „Nazwa / opis turnieju").

Zmiany **zapisują się automatycznie** (status widać na dole ekranu).
Każdy, kto ogląda tabelę na innym urządzeniu, zobaczy aktualizację **od razu** —
bez odświeżania strony.

---

## 🔁 Live-reload plików źródłowych

Podczas pracy nad wyglądem strony możesz edytować pliki w katalogu `public/`
(`index.html`, `style.css`, `app.js`). Po zapisaniu pliku **strona w przeglądarce
odświeży się sama** — nie trzeba restartować serwera ani ręcznie odświeżać.

---

## 🗂️ Struktura projektu

```
puchar-felka/
├─ server.js            # serwer Node.js (hosting + API + live-reload)
├─ config.json          # port i PIN edycji
├─ package.json
├─ data/
│  ├─ tournament.json   # dane turnieju (grupy, drużyny, mecze, wyniki)
│  └─ backups/          # automatyczne kopie zapasowe przy każdym zapisie
└─ public/
   ├─ index.html
   ├─ style.css
   └─ app.js
```

Dane turnieju trzymane są w **`data/tournament.json`** — możesz je też edytować
ręcznie w edytorze tekstu (serwer wykryje zmianę i odświeży tabelę u wszystkich).

---

## ⚙️ Konfiguracja (`config.json`)

```json
{
  "port": 3000,
  "editPin": "felek"
}
```

- **`port`** — port serwera.
- **`editPin`** — PIN wymagany do edycji. Ustaw `""` (pusty), aby wyłączyć ochronę.

> To zabezpieczenie jest celowo lekkie — przeznaczone do zaufanej sieci lokalnej,
> a nie do publicznego internetu.

---

## 🧮 Jak liczona jest tabela

Punkty: **wygrana 3 / remis 1 / porażka 0** (do zmiany w ustawieniach).
Kolejność w tabeli: **punkty → różnica bramek → bramki zdobyte → nazwa**.
Drużyny na pozycjach awansu są oznaczone zielonym paskiem i strzałką ▲.
