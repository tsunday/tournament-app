'use strict';

/**
 * Atrapa kolekcji MongoDB do testów repozytoriów.
 * Nagrywa wywołania i obsługuje tylko metody używane przez repozytoria:
 * find().sort().skip().toArray(), findOne, insertOne/Many, deleteMany,
 * updateOne, countDocuments, createIndex.
 */
function makeFakeCollection() {
  const calls = [];
  let findResult = [];

  const col = {
    calls,
    setFindResult(rows) { findResult = rows; },
    names() { return calls.map((c) => c[0]); },
    call(name) { return calls.find((c) => c[0] === name); },

    find(query, options) {
      calls.push(['find', query, options]);
      const cursor = {
        sort(spec) { calls.push(['sort', spec]); return cursor; },
        skip(n) { calls.push(['skip', n]); return cursor; },
        limit(n) { calls.push(['limit', n]); return cursor; },
        toArray: async () => findResult.slice(),
      };
      return cursor;
    },
    async findOne(filter) { calls.push(['findOne', filter]); return findResult[0] || null; },
    async insertOne(doc) { calls.push(['insertOne', doc]); },
    async insertMany(docs) { calls.push(['insertMany', docs]); },
    async deleteMany(filter) { calls.push(['deleteMany', filter]); },
    async updateOne(filter, update, opts) { calls.push(['updateOne', filter, update, opts]); },
    async countDocuments(filter) { calls.push(['countDocuments', filter]); return findResult.length; },
    async createIndex(spec) { calls.push(['createIndex', spec]); },
  };
  return col;
}

module.exports = { makeFakeCollection };
