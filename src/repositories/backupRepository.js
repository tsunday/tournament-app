'use strict';

const BaseRepository = require('./baseRepository');

/**
 * Repozytorium migawek (kopii zapasowych) pełnego dokumentu turnieju.
 * Trzyma tylko `keep` najnowszych wpisów.
 */
class BackupRepository extends BaseRepository {
  insert(snapshot) {
    return this.collection.insertOne(snapshot);
  }

  async pruneKeeping(keep) {
    const stale = await this.collection
      .find({}, { projection: { _id: 1 } })
      .sort({ at: -1 })
      .skip(keep)
      .toArray();
    if (stale.length) {
      await this.collection.deleteMany({ _id: { $in: stale.map((d) => d._id) } });
    }
  }

  ensureIndexes() {
    return this.collection.createIndex({ at: -1 });
  }
}

module.exports = BackupRepository;
