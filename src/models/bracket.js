'use strict';

const Team = require('./team');
const Match = require('./match');

/**
 * Drabinka pucharowa dla 8 osób:
 *   players – lista zawodników,
 *   qf      – ćwierćfinały (4 mecze z obsadzonymi uczestnikami),
 *   sf      – półfinały (2 mecze; uczestnicy wyliczani z QF po stronie klienta),
 *   final   – finał,
 *   third   – mecz o 3. miejsce.
 * Struktura jest stała i mała — w bazie osadzona w dokumencie turnieju.
 */
class Bracket {
  constructor(data = {}) {
    this.players = (data.players || []).map((p) => (p instanceof Team ? p : new Team(p)));
    this.qf = (data.qf || []).map((m) => new Match(m));
    this.sf = (data.sf || []).map((m) => new Match(m));
    this.final = new Match(data.final || { id: 'final' });
    this.third = new Match(data.third || { id: 'third' });
  }

  toApi() {
    return {
      players: this.players.map((p) => p.toApi()),
      qf: this.qf.map((m) => m.toApi()),
      sf: this.sf.map((m) => m.toApi()),
      final: this.final.toApi(),
      third: this.third.toApi(),
    };
  }
}

module.exports = Bracket;
