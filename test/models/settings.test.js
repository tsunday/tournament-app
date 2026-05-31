'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Settings = require('../../src/models/settings');

test('Settings stosuje domyślne wartości', () => {
  assert.deepEqual(new Settings().toJSON(), {
    pointsWin: 3, pointsDraw: 1, pointsLoss: 0, qualifyCount: 2,
  });
});

test('Settings parsuje stringi i nie pozwala na ujemny qualifyCount', () => {
  const s = new Settings({ pointsWin: '5', pointsDraw: '2', pointsLoss: '0', qualifyCount: -3 });
  assert.equal(s.pointsWin, 5);
  assert.equal(s.pointsDraw, 2);
  assert.equal(s.qualifyCount, 0);
});
