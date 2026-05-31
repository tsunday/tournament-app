'use strict';

const { str, idOrNull, normalizeScore } = require('./normalize');

/**
 * Mecz — używany zarówno w grupach, jak i w drabince pucharowej.
 * `played` jest wyliczane: mecz jest rozegrany, gdy obie bramki są wpisane.
 * W drabince uczestnicy (homeId/awayId) bywają nieobsadzeni (null).
 */
class Match {
  constructor(data = {}) {
    this.id = str(data.id);
    this.homeId = idOrNull(data.homeId);
    this.awayId = idOrNull(data.awayId);
    this.homeScore = normalizeScore(data.homeScore);
    this.awayScore = normalizeScore(data.awayScore);
    this.played = this.homeScore !== null && this.awayScore !== null;
  }

  // Zwycięzca meczu (null = nierozegrany lub remis).
  winnerId() {
    if (!this.played) return null;
    if (this.homeScore > this.awayScore) return this.homeId;
    if (this.awayScore > this.homeScore) return this.awayId;
    return null;
  }

  toApi() {
    return {
      id: this.id,
      homeId: this.homeId,
      awayId: this.awayId,
      homeScore: this.homeScore,
      awayScore: this.awayScore,
      played: this.played,
    };
  }
}

module.exports = Match;
