'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Match = require('../../src/models/match');

test('Match normalizuje wyniki i wylicza played', () => {
  const m = new Match({ id: 'm1', homeId: 'a', awayId: 'b', homeScore: '3', awayScore: '1' });
  assert.equal(m.homeScore, 3);
  assert.equal(m.awayScore, 1);
  assert.equal(m.played, true);
});

test('Match: brak wyniku => played=false i score=null', () => {
  const m = new Match({ id: 'm1', homeId: 'a', awayId: 'b', homeScore: '', awayScore: null });
  assert.equal(m.homeScore, null);
  assert.equal(m.awayScore, null);
  assert.equal(m.played, false);
});

test('Match: ujemny wynik przycinany do 0, śmieci => null', () => {
  assert.equal(new Match({ homeScore: -5 }).homeScore, 0);
  assert.equal(new Match({ homeScore: 'abc' }).homeScore, null);
});

test('Match: nieobsadzeni uczestnicy => null (drabinka)', () => {
  const m = new Match({ id: 'sf1', homeScore: 1, awayScore: 0 });
  assert.equal(m.homeId, null);
  assert.equal(m.awayId, null);
});

test('Match.winnerId: gospodarz / gość / remis / nierozegrany', () => {
  assert.equal(new Match({ homeId: 'a', awayId: 'b', homeScore: 2, awayScore: 1 }).winnerId(), 'a');
  assert.equal(new Match({ homeId: 'a', awayId: 'b', homeScore: 0, awayScore: 3 }).winnerId(), 'b');
  assert.equal(new Match({ homeId: 'a', awayId: 'b', homeScore: 1, awayScore: 1 }).winnerId(), null);
  assert.equal(new Match({ homeId: 'a', awayId: 'b', homeScore: null, awayScore: 1 }).winnerId(), null);
});

test('Match.toApi zwraca pełny kształt', () => {
  const api = new Match({ id: 'm1', homeId: 'a', awayId: 'b', homeScore: 2, awayScore: 2 }).toApi();
  assert.deepEqual(api, { id: 'm1', homeId: 'a', awayId: 'b', homeScore: 2, awayScore: 2, played: true });
});
