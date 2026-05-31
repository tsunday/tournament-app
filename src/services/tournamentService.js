'use strict';

const Tournament = require('../models/tournament');

const DEFAULT_BACKUP_LIMIT = 20;

/**
 * Warstwa serwisowa — orkiestruje repozytoria i modele.
 * Nie wie nic o MongoDB; operuje na repozytoriach (łatwo testować z atrapami).
 *
 * Uwaga: zapis to upsert dokumentu + replace kolekcji. Standalone MongoDB nie
 * wspiera transakcji — przy jednym edytorze w sieci LAN ryzyko częściowego
 * zapisu jest pomijalne.
 */
class TournamentService {
  constructor({
    tournamentRepo,
    groupRepo,
    teamRepo,
    matchRepo,
    backupRepo,
    tournamentId = 'main',
    backupLimit = DEFAULT_BACKUP_LIMIT,
    now,
  } = {}) {
    this.tournamentRepo = tournamentRepo;
    this.groupRepo = groupRepo;
    this.teamRepo = teamRepo;
    this.matchRepo = matchRepo;
    this.backupRepo = backupRepo;
    this.tournamentId = tournamentId;
    this.backupLimit = backupLimit;
    // Zegar wstrzykiwany — w testach podajemy stałą wartość.
    this.now = now || (() => new Date().toISOString());
  }

  async ensureIndexes() {
    await Promise.all([
      this.tournamentRepo.ensureIndexes(),
      this.groupRepo.ensureIndexes(),
      this.teamRepo.ensureIndexes(),
      this.matchRepo.ensureIndexes(),
      this.backupRepo.ensureIndexes(),
    ]);
  }

  // Składa pełny dokument turnieju (kształt API) z kolekcji.
  async read() {
    const tid = this.tournamentId;
    const tournamentDoc = await this.tournamentRepo.findById(tid);
    if (!tournamentDoc) return null;

    const [groupDocs, teamDocs, matchDocs] = await Promise.all([
      this.groupRepo.findByTournament(tid),
      this.teamRepo.findByTournament(tid),
      this.matchRepo.findByTournament(tid),
    ]);

    return Tournament.fromCollections({ tournamentDoc, groupDocs, teamDocs, matchDocs }).toApi();
  }

  // Waliduje/normalizuje przez model i rozkłada na kolekcje. Zwraca updatedAt.
  async write(data) {
    const tid = this.tournamentId;
    const tournament = Tournament.fromApi(data);
    tournament.updatedAt = this.now();

    const { tournamentDoc, groupDocs, teamDocs, matchDocs } = tournament.toCollections(tid);

    await this.tournamentRepo.upsert(tid, tournamentDoc);
    await Promise.all([
      this.groupRepo.replaceForTournament(tid, groupDocs),
      this.teamRepo.replaceForTournament(tid, teamDocs),
      this.matchRepo.replaceForTournament(tid, matchDocs),
    ]);

    await this._snapshot(tournament);
    return tournament.updatedAt;
  }

  async _snapshot(tournament) {
    try {
      await this.backupRepo.insert({ at: tournament.updatedAt, data: tournament.toApi() });
      await this.backupRepo.pruneKeeping(this.backupLimit);
    } catch (e) {
      // Kopia zapasowa jest pomocnicza — nie blokuje zapisu, gdy się nie powiedzie.
      console.warn('Nie udało się zapisać migawki backup:', e.message);
    }
  }

  // Jednorazowa inicjalizacja pustej bazy. Zwraca true, gdy zasiano dane.
  async migrateIfEmpty(seedFn, log) {
    const count = await this.tournamentRepo.count();
    if (count > 0) return false;
    await this.write(seedFn());
    if (log) log('Zainicjowano bazę danymi startowymi.');
    return true;
  }
}

module.exports = TournamentService;
module.exports.DEFAULT_BACKUP_LIMIT = DEFAULT_BACKUP_LIMIT;
