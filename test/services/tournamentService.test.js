'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const TournamentService = require('../../src/services/tournamentService');

const FIXED_NOW = '2030-01-01T00:00:00.000Z';

// Buduje serwis z atrapami repozytoriów, nagrywając wywołania zapisu.
function buildService(overrides = {}) {
  const rec = { upserts: [], replaces: {}, backups: [], prunes: [] };

  const tournamentRepo = {
    doc: overrides.tournamentDoc || null,
    countValue: overrides.count || 0,
    findById: async () => tournamentRepo.doc,
    upsert: async (id, doc) => rec.upserts.push({ id, doc }),
    count: async () => tournamentRepo.countValue,
    ensureIndexes: async () => {},
  };

  const scoped = (key, docs = []) => ({
    findByTournament: async () => docs,
    replaceForTournament: async (tid, d) => { rec.replaces[key] = { tid, docs: d }; },
    ensureIndexes: async () => {},
  });

  const backupRepo = {
    insert: async (snap) => rec.backups.push(snap),
    pruneKeeping: async (n) => rec.prunes.push(n),
    ensureIndexes: async () => {},
  };

  const service = new TournamentService({
    tournamentRepo,
    groupRepo: scoped('groups', overrides.groupDocs),
    teamRepo: scoped('teams', overrides.teamDocs),
    matchRepo: scoped('matches', overrides.matchDocs),
    backupRepo,
    tournamentId: 'main',
    now: () => FIXED_NOW,
  });

  return { service, rec };
}

test('read() zwraca null, gdy brak dokumentu turnieju', async () => {
  const { service } = buildService({ tournamentDoc: null });
  assert.equal(await service.read(), null);
});

test('read() składa pełny dokument z kolekcji', async () => {
  const { service } = buildService({
    tournamentDoc: {
      tournamentName: 'X', year: '', subtitle: '', mode: 'groups',
      settings: { pointsWin: 3, pointsDraw: 1, pointsLoss: 0, qualifyCount: 2 },
      bracket: null, updatedAt: FIXED_NOW,
    },
    groupDocs: [{ tournamentId: 'main', id: 'g1', name: 'A', order: 0 }],
    teamDocs: [{ tournamentId: 'main', groupId: 'g1', id: 't1', name: 'Alfa', order: 0 }],
    matchDocs: [],
  });

  const api = await service.read();
  assert.equal(api.tournamentName, 'X');
  assert.equal(api.groups[0].teams[0].name, 'Alfa');
});

test('write() stempluje updatedAt, rozkłada na kolekcje i robi backup', async () => {
  const { service, rec } = buildService();
  const updatedAt = await service.write({
    tournamentName: 'Cup', mode: 'groups',
    groups: [{
      id: 'g1', name: 'A',
      teams: [{ id: 't1', name: 'Alfa' }],
      matches: [{ id: 'm1', homeId: 't1', awayId: 't2', homeScore: 1, awayScore: 0 }],
    }],
  });

  assert.equal(updatedAt, FIXED_NOW);
  // dokument turnieju
  assert.equal(rec.upserts.length, 1);
  assert.equal(rec.upserts[0].doc.updatedAt, FIXED_NOW);
  // znormalizowane kolekcje
  assert.equal(rec.replaces.groups.docs.length, 1);
  assert.equal(rec.replaces.teams.docs.length, 1);
  assert.equal(rec.replaces.matches.docs.length, 1);
  assert.equal(rec.replaces.matches.docs[0].played, true);
  // backup + prune
  assert.equal(rec.backups.length, 1);
  assert.equal(rec.backups[0].at, FIXED_NOW);
  assert.deepEqual(rec.prunes, [20]);
});

test('write() nie wywala się, gdy backup zawiedzie', async () => {
  const { service } = buildService();
  service.backupRepo.insert = async () => { throw new Error('boom'); };
  const updatedAt = await service.write({ tournamentName: 'Cup', mode: 'groups', groups: [] });
  assert.equal(updatedAt, FIXED_NOW); // zapis się udał mimo błędu backupu
});

test('migrateIfEmpty zasiewa tylko pustą bazę', async () => {
  const empty = buildService({ count: 0 });
  assert.equal(await empty.service.migrateIfEmpty(() => ({ tournamentName: 'Seed', groups: [] })), true);
  assert.equal(empty.rec.upserts.length, 1);

  const full = buildService({ count: 1 });
  assert.equal(await full.service.migrateIfEmpty(() => ({ tournamentName: 'Seed', groups: [] })), false);
  assert.equal(full.rec.upserts.length, 0);
});
