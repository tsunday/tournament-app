'use strict';

const { intOr } = require('./normalize');

/**
 * Ustawienia turnieju: punktacja i liczba awansujących z grupy.
 */
class Settings {
  constructor(data = {}) {
    this.pointsWin = intOr(data && data.pointsWin, 3);
    this.pointsDraw = intOr(data && data.pointsDraw, 1);
    this.pointsLoss = intOr(data && data.pointsLoss, 0);
    this.qualifyCount = Math.max(0, intOr(data && data.qualifyCount, 2));
  }

  toJSON() {
    return {
      pointsWin: this.pointsWin,
      pointsDraw: this.pointsDraw,
      pointsLoss: this.pointsLoss,
      qualifyCount: this.qualifyCount,
    };
  }
}

module.exports = Settings;
