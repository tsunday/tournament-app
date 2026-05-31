'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Tournament = require('../../src/models/tournament');

function sampleApi() {
  return {
    tournamentName: 'Test Cup',
    year: '2026',
    subtitle: 's',
    mode: 'groups',
    settings: { pointsWin: 3, pointsDraw: 1, pointsLoss: 0, qualifyCount: 2 },
    groups: [{
      id: 'g1', name: 'A',
      teams: [{ id: 't1', name: 'Alfa' }, { id: 't2', name: 'Beta' }],
      matches: [{ id: 'm1', homeId: 't1', awayId: 't2', homeScore: 2, awayScore: 1 }],
    }],
  };
}

test('fromApi → toApi zachowuje strukturę i wylicza played', () => {
  const api = Tournament.fromApi(sampleApi()).toApi();
  assert.equal(api.tournamentName, 'Test Cup');
  assert.equal(api.mode, 'groups');
  assert.equal(api.groups[0].teams.length, 2);
  assert.equal(api.groups[0].matches[0].played, true);
});

test('mode normalizuje się do groups gdy nieznany', () => {
  assert.equal(Tournament.fromApi({ mode: 'xyz' }).mode, 'groups');
  assert.equal(Tournament.fromApi({ mode: 'bracket' }).mode, 'bracket');
});

test('bracket pojawia się w API tylko, gdy obecny', () => {
  assert.equal('bracket' in Tournament.fromApi(sampleApi()).toApi(), false);
  const withBracket = Tournament.fromApi(Object.assign(sampleApi(), {
    bracket: { players: [{ id: 'p1', name: 'Ala' }], qf: [], sf: [], final: {}, third: {} },
  })).toApi();
  assert.equal(withBracket.bracket.players[0].name, 'Ala');
});

test('toCollections rozkłada na znormalizowane dokumenty z kolejnością', () => {
  const { tournamentDoc, groupDocs, teamDocs, matchDocs } = Tournament
    .fromApi(sampleApi()).toCollections('main');

  assert.equal(tournamentDoc._id, 'main');
  assert.equal(tournamentDoc.mode, 'groups');
  assert.equal(groupDocs.length, 1);
  assert.equal(teamDocs.length, 2);
  assert.equal(matchDocs.length, 1);
  // powiązania i kolejność
  assert.equal(teamDocs[0].tournamentId, 'main');
  assert.equal(teamDocs[0].groupId, 'g1');
  assert.deepEqual(teamDocs.map((t) => t.order), [0, 1]);
  assert.equal(matchDocs[0].played, true);
});

test('fromCollections składa z powrotem, sortując po order i filtrując po grupie', () => {
  const tournamentDoc = {
    tournamentName: 'X', year: '', subtitle: '', mode: 'groups',
    settings: { pointsWin: 3, pointsDraw: 1, pointsLoss: 0, qualifyCount: 2 },
    bracket: null, updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const groupDocs = [
    { tournamentId: 'main', id: 'g2', name: 'B', order: 1 },
    { tournamentId: 'main', id: 'g1', name: 'A', order: 0 },
  ];
  const teamDocs = [
    { tournamentId: 'main', groupId: 'g1', id: 't2', name: 'Beta', order: 1 },
    { tournamentId: 'main', groupId: 'g1', id: 't1', name: 'Alfa', order: 0 },
    { tournamentId: 'main', groupId: 'g2', id: 't3', name: 'Gamma', order: 0 },
  ];
  const matchDocs = [];

  const api = Tournament.fromCollections({ tournamentDoc, groupDocs, teamDocs, matchDocs }).toApi();
  assert.deepEqual(api.groups.map((g) => g.name), ['A', 'B']); // posortowane po order
  assert.deepEqual(api.groups[0].teams.map((t) => t.name), ['Alfa', 'Beta']);
  assert.equal(api.groups[1].teams.length, 1); // tylko zespół z g2
  assert.equal(api.updatedAt, '2026-01-01T00:00:00.000Z');
});

test('fromCollections zwraca null bez dokumentu turnieju', () => {
  assert.equal(Tournament.fromCollections({ tournamentDoc: null }), null);
});

test('round-trip API → kolekcje → API jest stabilny', () => {
  const t1 = Tournament.fromApi(sampleApi());
  const cols = t1.toCollections('main');
  const back = Tournament.fromCollections(cols).toApi();
  // ignorujemy updatedAt (ustawiany przez serwis)
  delete back.updatedAt;
  const expected = Tournament.fromApi(sampleApi()).toApi();
  delete expected.updatedAt;
  assert.deepEqual(back, expected);
});
