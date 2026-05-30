/**
 * Puchar Felka 2016 — serwer turniejowy
 * --------------------------------------
 * Zero zewnętrznych zależności. Wymaga tylko Node.js (>= 16).
 *
 * Funkcje:
 *  - Hostuje pliki statyczne z katalogu /public w sieci lokalnej (0.0.0.0)
 *  - GET  /api/data        -> zwraca dane turnieju (data/tournament.json)
 *  - POST /api/data        -> zapisuje dane turnieju (wymaga nagłówka x-edit-pin, jeśli ustawiony PIN)
 *  - GET  /api/events      -> Server-Sent Events:
 *        * event "data"   gdy zmieni się tournament.json (synchronizacja na żywo u widzów)
 *        * event "reload" gdy zmieni się plik źródłowy w /public (live-reload przy edycji)
 *
 * Uruchomienie:  node server.js   (opcjonalnie: PORT=8080 node server.js)
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------- Konfiguracja ----------
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'tournament.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
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
const EDIT_PIN = (config.editPin === undefined ? '' : String(config.editPin)).trim();

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

function backupData() {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(DATA_FILE, path.join(BACKUP_DIR, `tournament-${stamp}.json`));
    // Zostaw tylko 20 ostatnich kopii
    const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.json')).sort();
    while (files.length > 20) {
      fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
    }
  } catch (e) {
    console.warn('Nie udało się zrobić kopii zapasowej:', e.message);
  }
}

// ---------- Routing ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);

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
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        return send(res, 200, raw, { 'Content-Type': 'application/json; charset=utf-8' });
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
        parsed.updatedAt = new Date().toISOString();
        backupData();
        fs.writeFileSync(DATA_FILE, JSON.stringify(parsed, null, 2), 'utf8');
        broadcast('data', { updatedAt: parsed.updatedAt });
        return sendJson(res, 200, { ok: true, updatedAt: parsed.updatedAt });
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

// ---------- Live-reload: obserwacja plików źródłowych i danych ----------
function watchForLiveReload() {
  let reloadTimer = null;
  let dataTimer = null;

  const triggerReload = () => {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => broadcast('reload', { at: Date.now() }), 120);
  };
  const triggerData = () => {
    clearTimeout(dataTimer);
    dataTimer = setTimeout(() => broadcast('data', { at: Date.now() }), 120);
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

  try {
    fs.watch(DATA_DIR, (_evt, filename) => {
      if (filename && filename.startsWith('tournament')) triggerData();
    });
  } catch (e) {
    console.warn('fs.watch(data) niedostępny:', e.message);
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

server.listen(PORT, '0.0.0.0', () => {
  watchForLiveReload();
  const ips = localIPs();
  console.log('\n  ⚽  Puchar Felka 2016 — serwer wystartował\n');
  console.log('  Lokalnie:        http://localhost:' + PORT);
  ips.forEach((ip) => console.log('  W sieci LAN:     http://' + ip + ':' + PORT));
  console.log('\n  Tryb edycji PIN: ' + (EDIT_PIN ? '(ustawiony w config.json)' : '(wyłączony)'));
  console.log('  Live-reload:     aktywny (edytuj pliki w /public — strona odświeży się sama)');
  console.log('\n  Zatrzymanie:     Ctrl + C\n');
});
