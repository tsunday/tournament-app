'use strict';

const BaseRepository = require('./baseRepository');

/**
 * Repozytorium dokumentu turnieju (metadane + ustawienia + tryb + drabinka).
 * Aplikacja obsługuje jeden turniej, adresowany stałym identyfikatorem.
 */
class TournamentRepository extends BaseRepository {
  findById(id) {
    return this.collection.findOne({ _id: id });
  }

  // Zapisuje pola dokumentu (bez nadpisywania _id).
  async upsert(id, doc) {
    const fields = Object.assign({}, doc);
    delete fields._id;
    await this.collection.updateOne({ _id: id }, { $set: fields }, { upsert: true });
  }

  count() {
    return this.collection.countDocuments();
  }
}

module.exports = TournamentRepository;
