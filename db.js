/**
 * Puchar Felka — warstwa danych (kompozycja).
 * ----------------------------------------------------------------
 * Ten plik to „composition root": łączy połączenie z MongoDB, repozytoria
 * (po jednym na kolekcję) i serwis turnieju, a na zewnątrz wystawia stabilne
 * API używane przez server.js: connect / readTournament / writeTournament / migrateIfEmpty.
 *
 * Warstwy:
 *   src/db/connection.js     – połączenie z MongoDB (z ponawianiem)
 *   src/models/*             – modele danych (walidacja + mapowanie API ↔ kolekcje)
 *   src/repositories/*       – dostęp do kolekcji (schemat znormalizowany)
 *   src/services/*           – orkiestracja (TournamentService)
 *
 * Schemat znormalizowany: kolekcje tournaments / groups / teams / matches,
 * plus backups (ostatnie 20 migawek). Drabinka pucharowa (stała, mała struktura)
 * jest osadzona w dokumencie tournaments.
 */

'use strict';

const { connect } = require('./src/db/connection');
const TournamentRepository = require('./src/repositories/tournamentRepository');
const GroupRepository = require('./src/repositories/groupRepository');
const TeamRepository = require('./src/repositories/teamRepository');
const MatchRepository = require('./src/repositories/matchRepository');
const BackupRepository = require('./src/repositories/backupRepository');
const TournamentService = require('./src/services/tournamentService');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.MONGODB_DB || 'puchar_felka';
const TID = 'main'; // identyfikator jedynego turnieju

let client = null;
let service = null;

async function connectDb(log) {
  const conn = await connect({ uri: MONGO_URI, dbName: DB_NAME, log });
  client = conn.client;
  const db = conn.db;

  service = new TournamentService({
    tournamentRepo: new TournamentRepository(db.collection('tournaments')),
    groupRepo: new GroupRepository(db.collection('groups')),
    teamRepo: new TeamRepository(db.collection('teams')),
    matchRepo: new MatchRepository(db.collection('matches')),
    backupRepo: new BackupRepository(db.collection('backups')),
    tournamentId: TID,
  });
  await service.ensureIndexes();
  return service;
}

function getService() {
  if (!service) throw new Error('Baza nie jest połączona — wywołaj connect() najpierw.');
  return service;
}

module.exports = {
  connect: connectDb,
  readTournament: () => getService().read(),
  writeTournament: (data) => getService().write(data),
  migrateIfEmpty: (seedFn, log) => getService().migrateIfEmpty(seedFn, log),
  close: () => (client ? client.close() : Promise.resolve()),
};
