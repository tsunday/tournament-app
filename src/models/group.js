'use strict';

const Team = require('./team');
const Match = require('./match');
const { str } = require('./normalize');

/**
 * Grupa turniejowa: nazwa + drużyny + mecze (tryb „każdy z każdym").
 */
class Group {
  constructor(data = {}) {
    this.id = str(data.id);
    this.name = str(data.name);
    this.teams = (data.teams || []).map((t) => (t instanceof Team ? t : new Team(t)));
    this.matches = (data.matches || []).map((m) => (m instanceof Match ? m : new Match(m)));
  }

  toApi() {
    return {
      id: this.id,
      name: this.name,
      teams: this.teams.map((t) => t.toApi()),
      matches: this.matches.map((m) => m.toApi()),
    };
  }
}

module.exports = Group;
