'use strict';

const BaseRepository = require('./baseRepository');

/**
 * Repozytorium encji powiązanych z turniejem (groups/teams/matches).
 * Każdy dokument ma `tournamentId` oraz `order` (kolejność prezentacji).
 */
class ScopedRepository extends BaseRepository {
  findByTournament(tournamentId) {
    return this.collection.find({ tournamentId }).sort({ order: 1 }).toArray();
  }

  // Atomowo „z punktu widzenia jednego edytora": kasuje i wstawia na nowo.
  async replaceForTournament(tournamentId, docs) {
    await this.collection.deleteMany({ tournamentId });
    if (docs && docs.length) await this.collection.insertMany(docs);
  }

  ensureIndexes() {
    return this.collection.createIndex({ tournamentId: 1, order: 1 });
  }
}

module.exports = ScopedRepository;
