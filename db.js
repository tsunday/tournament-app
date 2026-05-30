/**
 * Puchar Felka — warstwa danych (MongoDB, schemat znormalizowany)
 * ----------------------------------------------------------------
 * Aplikacja obsługuje jeden turniej (singleton o stałym id TID).
 *
 * Kolekcje (schemat znormalizowany):
 *   tournaments  – metadane + ustawienia + tryb + drabinka pucharowa + updatedAt
 *   groups       – { tournamentId, id, name, order }
 *   teams        – { tournamentId, groupId, id, name, order }
 *   matches      – { tournamentId, groupId, id, homeId, awayId, homeScore, awayScore, played, order }
 *   backups      – ostatnie 20 migawek pełnego dokumentu (zamiast kopii plikowych)
 *
 * Grupy / drużyny / mecze są rozbite na osobne kolekcje. Drabinka pucharowa
 * (players + qf/sf/final/third) ma stałą, małą strukturę i jest osadzona
 * w dokumencie `tournaments`.
 *
 * Kontrakt API pozostaje bez zmian: readTournament() składa pełny dokument
 * w kształcie, jakiego oczekuje frontend; writeTournament() rozbija go z powrotem.
 */

'use strict';

const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.MONGODB_DB || 'puchar_felka';
const TID = 'main'; // identyfikator jedynego turnieju

let db = null;

// Łączy się z MongoDB z ponawianiem (kontener bazy może wstawać wolniej niż app).
async function connect(log) {
  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 3000 });
  for (let attempt = 1; ; attempt++) {
    try {
      await client.connect();
      await client.db(DB_NAME).command({ ping: 1 });
      db = client.db(DB_NAME);
      await ensureIndexes();
      if (log) log('Połączono z MongoDB: ' + MONGO_URI + ' (baza: ' + DB_NAME + ')');
      return;
    } catch (e) {
      if (attempt >= 30) throw e;
      if (log) log(`MongoDB niedostępne (próba ${attempt}/30) — ponawiam za 2 s…`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function ensureIndexes() {
  await db.collection('groups').createIndex({ tournamentId: 1, order: 1 });
  await db.collection('teams').createIndex({ tournamentId: 1, order: 1 });
  await db.collection('matches').createIndex({ tournamentId: 1, order: 1 });
  await db.collection('backups').createIndex({ at: -1 });
}

// Składa pełny dokument turnieju z kolekcji (kształt oczekiwany przez frontend).
async function readTournament() {
  const t = await db.collection('tournaments').findOne({ _id: TID });
  if (!t) return null;

  const [groups, teams, matches] = await Promise.all([
    db.collection('groups').find({ tournamentId: TID }).sort({ order: 1 }).toArray(),
    db.collection('teams').find({ tournamentId: TID }).sort({ order: 1 }).toArray(),
    db.collection('matches').find({ tournamentId: TID }).sort({ order: 1 }).toArray(),
  ]);

  const groupsOut = groups.map((g) => ({
    id: g.id,
    name: g.name,
    teams: teams
      .filter((x) => x.groupId === g.id)
      .map((x) => ({ id: x.id, name: x.name })),
    matches: matches
      .filter((x) => x.groupId === g.id)
      .map((x) => ({
        id: x.id, homeId: x.homeId, awayId: x.awayId,
        homeScore: x.homeScore, awayScore: x.awayScore, played: x.played,
      })),
  }));

  const out = {
    tournamentName: t.tournamentName,
    year: t.year,
    subtitle: t.subtitle,
    settings: t.settings,
    mode: t.mode || 'groups',
    groups: groupsOut,
    updatedAt: t.updatedAt,
  };
  if (t.bracket) out.bracket = t.bracket;
  return out;
}

// Rozbija pełny dokument na kolekcje. Zwraca nowe updatedAt.
// Uwaga: standalone MongoDB nie wspiera transakcji — przy zapisie lokalnym
// (jeden edytor w sieci LAN) ryzyko częściowego zapisu jest pomijalne.
async function writeTournament(data) {
  const updatedAt = new Date().toISOString();

  await db.collection('tournaments').updateOne(
    { _id: TID },
    {
      $set: {
        tournamentName: data.tournamentName,
        year: data.year,
        subtitle: data.subtitle,
        settings: data.settings,
        mode: data.mode === 'bracket' ? 'bracket' : 'groups',
        bracket: data.bracket || null,
        updatedAt,
      },
    },
    { upsert: true }
  );

  await Promise.all([
    db.collection('groups').deleteMany({ tournamentId: TID }),
    db.collection('teams').deleteMany({ tournamentId: TID }),
    db.collection('matches').deleteMany({ tournamentId: TID }),
  ]);

  const groupDocs = [];
  const teamDocs = [];
  const matchDocs = [];
  (data.groups || []).forEach((g, gi) => {
    groupDocs.push({ tournamentId: TID, id: g.id, name: g.name, order: gi });
    (g.teams || []).forEach((t, ti) => {
      teamDocs.push({ tournamentId: TID, groupId: g.id, id: t.id, name: t.name, order: ti });
    });
    (g.matches || []).forEach((m, mi) => {
      matchDocs.push({
        tournamentId: TID, groupId: g.id, id: m.id,
        homeId: m.homeId, awayId: m.awayId,
        homeScore: m.homeScore, awayScore: m.awayScore, played: m.played, order: mi,
      });
    });
  });

  if (groupDocs.length) await db.collection('groups').insertMany(groupDocs);
  if (teamDocs.length) await db.collection('teams').insertMany(teamDocs);
  if (matchDocs.length) await db.collection('matches').insertMany(matchDocs);

  await backupSnapshot(data, updatedAt);
  return updatedAt;
}

// Migawka pełnego dokumentu do kolekcji `backups`; trzyma 20 ostatnich.
async function backupSnapshot(data, updatedAt) {
  try {
    await db.collection('backups').insertOne({ at: updatedAt, data });
    const stale = await db.collection('backups')
      .find({}, { projection: { _id: 1 } })
      .sort({ at: -1 })
      .skip(20)
      .toArray();
    if (stale.length) {
      await db.collection('backups').deleteMany({ _id: { $in: stale.map((d) => d._id) } });
    }
  } catch (e) {
    // Kopia zapasowa jest pomocnicza — nie blokuj zapisu, gdy się nie powiedzie.
    console.warn('Nie udało się zapisać migawki backup:', e.message);
  }
}

// Jednorazowa migracja: jeśli baza jest pusta, zaimportuj dane z seedFn().
async function migrateIfEmpty(seedFn, log) {
  const count = await db.collection('tournaments').countDocuments();
  if (count > 0) return;
  const seed = seedFn();
  await writeTournament(seed);
  if (log) log('Zainicjowano bazę danymi startowymi.');
}

module.exports = { connect, readTournament, writeTournament, migrateIfEmpty };
