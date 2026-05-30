/**
 * Puchar Felka — serwer turniejowy
 * --------------------------------------
 * Dane przechowywane w MongoDB (schemat znormalizowany — patrz db.js).
 * Wymaga Node.js (>= 18) oraz dostępnej instancji MongoDB (zmienna MONGODB_URI).
 *
 * Funkcje:
 *  - Hostuje pliki statyczne z katalogu /public w sieci lokalnej (0.0.0.0)
 *  - GET  /api/data        -> zwraca pełny dokument turnieju (złożony z kolekcji)
 *  - POST /api/data        -> zapisuje dane turnieju (wymaga nagłówka x-edit-pin, jeśli ustawiony PIN)
 *  - GET  /api/health      -> prosty health-check (dla Dockera / load balancera)
 *  - GET  /api/events      -> Server-Sent Events:
 *        * event "data"   po zapisie danych (synchronizacja na żywo u widzów)
 *        * event "reload" gdy zmieni się plik źródłowy w /public (live-reload przy edycji)
 *
 * Uruchomienie:  node server.js   (najpierw `npm install`; konfiguracja przez env / config.json)
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const db = require('./db');

// ---------- Konfiguracja ----------
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const CONFIG_FILE = path.join(ROOT, 'config.json');

function loadConfig() {
  const defaults = { port: 3000, editPin: 'felek' };
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return Object.assign({}, defaults, cfg);
  } catch (_) {
    return defaults;
  }
}
const config = loadConfig();
const PORT = Number(process.env.PORT) || config.port || 3000;
// PIN można nadpisać zmienną środowiskową (wygodne w Dockerze).
const EDIT_PIN = (process.env.EDIT_PIN !== undefined ? process.env.EDIT_PIN
  : (config.editPin === undefined ? '' : String(config.editPin))).trim();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

// ---------- Klienci SSE (live-reload + synchronizacja danych) ----------
const sseClients = new Set();

function broadcast(event, payload) {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload || {})}\n\n`;
  for (const res of sseClients) {
    try { res.write(data); } catch (_) { /* ignoruj zerwane połączenia */ }
  }
}

// ---------- Pomocnicze ----------
function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({ 'Cache-Control': 'no-cache' }, headers || {}));
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 5 * 1024 * 1024) { reject(new Error('Body zbyt duże')); req.destroy(); return; }
      raw += chunk;
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

// Dane startowe przy pustej bazie: minimalny pusty turniej.
// (Źródłem prawdy jest MongoDB — turniej tworzy się przez interfejs.)
function seedData() {
  return {
    tournamentName: 'Puchar Felka',
    year: '',
    subtitle: 'Turniej piłkarski dla dzieci',
    settings: { pointsWin: 3, pointsDraw: 1, pointsLoss: 0, qualifyCount: 2 },
    mode: 'groups',
    groups: [],
  };
}

// ---------- Routing ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);

  // --- API: health-check ---
  if (pathname === '/api/health') {
    return sendJson(res, 200, { ok: true });
  }

  // --- API: SSE ---
  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    res.write(': połączono\n\n');
    sseClients.add(res);
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (_) {} }, 25000);
    req.on('close', () => { clearInterval(ping); sseClients.delete(res); });
    return;
  }

  // --- API: dane turnieju ---
  if (pathname === '/api/data') {
    if (req.method === 'GET') {
      try {
        const data = await db.readTournament();
        if (!data) return sendJson(res, 404, { error: 'Brak danych turnieju.' });
        return sendJson(res, 200, data);
      } catch (e) {
        return sendJson(res, 500, { error: 'Nie można odczytać danych: ' + e.message });
      }
    }
    if (req.method === 'POST') {
      // Lekka ochrona PIN-em (tylko sieć lokalna — to nie jest pełne uwierzytelnianie)
      if (EDIT_PIN) {
        const pin = (req.headers['x-edit-pin'] || '').toString();
        if (pin !== EDIT_PIN) return sendJson(res, 403, { error: 'Nieprawidłowy PIN edycji.' });
      }
      try {
        const raw = await readBody(req);
        const parsed = JSON.parse(raw); // walidacja, że to poprawny JSON
        const updatedAt = await db.writeTournament(parsed);
        broadcast('data', { updatedAt });
        return sendJson(res, 200, { ok: true, updatedAt });
      } catch (e) {
        return sendJson(res, 400, { error: 'Błędne dane: ' + e.message });
      }
    }
    return sendJson(res, 405, { error: 'Metoda niedozwolona' });
  }

  // --- Logo turnieju (leży poza /public, w data/images) ---
  if (pathname === '/logo.png' && (req.method === 'GET' || req.method === 'HEAD')) {
    const logoPath = path.join(DATA_DIR, 'images', 'logo.png');
    return fs.stat(logoPath, (err, stat) => {
      if (err || !stat.isFile()) return send(res, 404, 'Brak logo');
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' });
      fs.createReadStream(logoPath).pipe(res);
    });
  }

  // --- Pliki statyczne ---
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method Not Allowed');
  }

  let rel = pathname === '/' ? '/index.html' : pathname;
  let filePath = path.normalize(path.join(PUBLIC_DIR, rel));

  // Zabezpieczenie przed wyjściem poza katalog public
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return send(res, 403, 'Forbidden');
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      return send(res, 404, 'Nie znaleziono: ' + rel);
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    fs.createReadStream(filePath).pipe(res);
  });
});

// ---------- Live-reload: obserwacja plików źródłowych ----------
function watchForLiveReload() {
  let reloadTimer = null;
  const triggerReload = () => {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => broadcast('reload', { at: Date.now() }), 120);
  };

  try {
    fs.watch(PUBLIC_DIR, { recursive: true }, (_evt, filename) => {
      if (!filename) return triggerReload();
      // Ignoruj pliki tymczasowe edytorów
      if (/(~|\.swp|\.tmp)$/.test(filename)) return;
      triggerReload();
    });
  } catch (e) {
    console.warn('fs.watch(public) niedostępny na tym systemie:', e.message);
  }
}

// ---------- Adresy w sieci lokalnej ----------
function localIPs() {
  const ips = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}

// ---------- Start ----------
async function start() {
  await db.connect((m) => console.log('  ' + m));
  await db.migrateIfEmpty(seedData, (m) => console.log('  ' + m));

  server.listen(PORT, '0.0.0.0', () => {
    watchForLiveReload();
    const ips = localIPs();
    console.log('\n  ⚽  Puchar Felka — serwer wystartował\n');
    console.log('  Lokalnie:        http://localhost:' + PORT);
    ips.forEach((ip) => console.log('  W sieci LAN:     http://' + ip + ':' + PORT));
    console.log('\n  Tryb edycji PIN: ' + (EDIT_PIN ? '(ustawiony)' : '(wyłączony)'));
    console.log('  Live-reload:     aktywny (edytuj pliki w /public — strona odświeży się sama)');
    console.log('\n  Zatrzymanie:     Ctrl + C\n');
  });
}

start().catch((e) => {
  console.error('\n  ✗ Nie udało się uruchomić serwera:', e.message, '\n');
  process.exit(1);
});
