'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeFakeCollection } = require('../helpers/fakeCollection');

const GroupRepository = require('../../src/repositories/groupRepository');
const TeamRepository = require('../../src/repositories/teamRepository');
const TournamentRepository = require('../../src/repositories/tournamentRepository');
const BackupRepository = require('../../src/repositories/backupRepository');
const BaseRepository = require('../../src/repositories/baseRepository');

test('BaseRepository wymaga kolekcji', () => {
  assert.throws(() => new BaseRepository(null), /wymaga kolekcji/);
});

test('ScopedRepository.findByTournament filtruje i sortuje po order', async () => {
  const col = makeFakeCollection();
  col.setFindResult([{ id: 'g1' }]);
  const repo = new GroupRepository(col);
  const res = await repo.findByTournament('main');

  assert.deepEqual(res, [{ id: 'g1' }]);
  assert.deepEqual(col.call('find')[1], { tournamentId: 'main' });
  assert.deepEqual(col.call('sort')[1], { order: 1 });
});

test('ScopedRepository.replaceForTournament kasuje a potem wstawia', async () => {
  const col = makeFakeCollection();
  const repo = new GroupRepository(col);
  await repo.replaceForTournament('main', [{ id: 'g1' }]);
  assert.deepEqual(col.names(), ['deleteMany', 'insertMany']);
  assert.deepEqual(col.call('deleteMany')[1], { tournamentId: 'main' });
});

test('replaceForTournament pomija insertMany przy pustej liście', async () => {
  const col = makeFakeCollection();
  const repo = new TeamRepository(col);
  await repo.replaceForTournament('main', []);
  assert.deepEqual(col.names(), ['deleteMany']);
});

test('ScopedRepository.ensureIndexes tworzy indeks złożony', async () => {
  const col = makeFakeCollection();
  await new GroupRepository(col).ensureIndexes();
  assert.deepEqual(col.call('createIndex')[1], { tournamentId: 1, order: 1 });
});

test('TournamentRepository.upsert nie nadpisuje _id', async () => {
  const col = makeFakeCollection();
  const repo = new TournamentRepository(col);
  await repo.upsert('main', { _id: 'main', tournamentName: 'X', mode: 'groups' });

  const up = col.call('updateOne');
  assert.deepEqual(up[1], { _id: 'main' });
  assert.deepEqual(up[2], { $set: { tournamentName: 'X', mode: 'groups' } });
  assert.deepEqual(up[3], { upsert: true });
});

test('TournamentRepository.findById / count', async () => {
  const col = makeFakeCollection();
  col.setFindResult([{ _id: 'main' }]);
  const repo = new TournamentRepository(col);
  assert.deepEqual(await repo.findById('main'), { _id: 'main' });
  assert.equal(await repo.count(), 1);
});

test('BackupRepository.pruneKeeping usuwa nadmiarowe migawki', async () => {
  const col = makeFakeCollection();
  col.setFindResult([{ _id: 1 }, { _id: 2 }]); // zwrócone jako „stale" (skip>limit)
  const repo = new BackupRepository(col);
  await repo.pruneKeeping(20);

  assert.deepEqual(col.call('skip')[1], 20);
  assert.deepEqual(col.call('deleteMany')[1], { _id: { $in: [1, 2] } });
});

test('BackupRepository.pruneKeeping nic nie usuwa, gdy brak nadmiaru', async () => {
  const col = makeFakeCollection();
  col.setFindResult([]);
  await new BackupRepository(col).pruneKeeping(20);
  assert.equal(col.call('deleteMany'), undefined);
});
