'use strict';

/**
 * Bazowe repozytorium — opakowuje pojedynczą kolekcję MongoDB.
 * Repozytoria izolują dostęp do bazy od logiki domenowej (serwisu/modeli),
 * dzięki czemu serwis można testować, podstawiając atrapy repozytoriów.
 */
class BaseRepository {
  constructor(collection) {
    if (!collection) throw new Error('Repozytorium wymaga kolekcji.');
    this.collection = collection;
  }

  // Domyślnie brak indeksów — repozytoria nadpisują w razie potrzeby.
  ensureIndexes() {
    return Promise.resolve();
  }
}

module.exports = BaseRepository;
