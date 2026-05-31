'use strict';

const { str } = require('./normalize');

/**
 * Drużyna (tryb grupowy) lub zawodnik (drabinka pucharowa): id + nazwa.
 */
class Team {
  constructor(data = {}) {
    this.id = str(data.id);
    this.name = str(data.name);
  }

  toApi() {
    return { id: this.id, name: this.name };
  }
}

module.exports = Team;
