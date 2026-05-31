'use strict';

const { MongoClient } = require('mongodb');

/**
 * Łączy się z MongoDB z ponawianiem — kontener bazy może wstawać wolniej
 * niż aplikacja. Zwraca { client, db }.
 */
async function connect({
  uri,
  dbName,
  log,
  retries = 30,
  delayMs = 2000,
  serverSelectionTimeoutMS = 3000,
} = {}) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS });
  for (let attempt = 1; ; attempt++) {
    try {
      await client.connect();
      await client.db(dbName).command({ ping: 1 });
      if (log) log(`Połączono z MongoDB: ${uri} (baza: ${dbName})`);
      return { client, db: client.db(dbName) };
    } catch (e) {
      if (attempt >= retries) throw e;
      if (log) log(`MongoDB niedostępne (próba ${attempt}/${retries}) — ponawiam za ${Math.round(delayMs / 1000)} s…`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

module.exports = { connect };
