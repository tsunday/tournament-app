'use strict';

const Group = require('./group');
const Bracket = require('./bracket');
const Settings = require('./settings');
const { str } = require('./normalize');

const byOrder = (a, b) => (a.order || 0) - (b.order || 0);

/**
 * Korzeń agregatu — pełny turniej. Centralizuje mapowanie między:
 *   - kształtem API (to, co wymienia frontend),
 *   - schematem znormalizowanym (osobne kolekcje tournaments/groups/teams/matches).
 */
class Tournament {
  constructor(data = {}) {
    this.tournamentName = str(data.tournamentName, 'Turniej');
    this.year = str(data.year);
    this.subtitle = str(data.subtitle);
    this.mode = data.mode === 'bracket' ? 'bracket' : 'groups';
    this.settings = data.settings instanceof Settings ? data.settings : new Settings(data.settings);
    this.groups = (data.groups || []).map((g) => (g instanceof Group ? g : new Group(g)));
    this.bracket = data.bracket
      ? (data.bracket instanceof Bracket ? data.bracket : new Bracket(data.bracket))
      : null;
    this.updatedAt = data.updatedAt || null;
  }

  // Z danych przysłanych przez klienta (kształt API).
  static fromApi(data) {
    return new Tournament(data || {});
  }

  // Złożenie z dokumentów kolekcji (schemat znormalizowany).
  static fromCollections({ tournamentDoc, groupDocs = [], teamDocs = [], matchDocs = [] } = {}) {
    if (!tournamentDoc) return null;
    const groups = groupDocs
      .slice()
      .sort(byOrder)
      .map((g) => new Group({
        id: g.id,
        name: g.name,
        teams: teamDocs
          .filter((t) => t.groupId === g.id)
          .sort(byOrder)
          .map((t) => ({ id: t.id, name: t.name })),
        matches: matchDocs
          .filter((m) => m.groupId === g.id)
          .sort(byOrder)
          .map((m) => ({
            id: m.id, homeId: m.homeId, awayId: m.awayId,
            homeScore: m.homeScore, awayScore: m.awayScore,
          })),
      }));

    return new Tournament({
      tournamentName: tournamentDoc.tournamentName,
      year: tournamentDoc.year,
      subtitle: tournamentDoc.subtitle,
      mode: tournamentDoc.mode,
      settings: tournamentDoc.settings,
      bracket: tournamentDoc.bracket || null,
      groups,
      updatedAt: tournamentDoc.updatedAt || null,
    });
  }

  // Kształt oczekiwany przez frontend.
  toApi() {
    const out = {
      tournamentName: this.tournamentName,
      year: this.year,
      subtitle: this.subtitle,
      settings: this.settings.toJSON(),
      mode: this.mode,
      groups: this.groups.map((g) => g.toApi()),
      updatedAt: this.updatedAt,
    };
    if (this.bracket) out.bracket = this.bracket.toApi();
    return out;
  }

  // Rozkład na dokumenty kolekcji (z zachowaniem kolejności i identyfikatorów klienta).
  toCollections(tournamentId) {
    const tournamentDoc = {
      _id: tournamentId,
      tournamentName: this.tournamentName,
      year: this.year,
      subtitle: this.subtitle,
      settings: this.settings.toJSON(),
      mode: this.mode,
      bracket: this.bracket ? this.bracket.toApi() : null,
      updatedAt: this.updatedAt,
    };

    const groupDocs = [];
    const teamDocs = [];
    const matchDocs = [];
    this.groups.forEach((g, gi) => {
      groupDocs.push({ tournamentId, id: g.id, name: g.name, order: gi });
      g.teams.forEach((t, ti) => {
        teamDocs.push({ tournamentId, groupId: g.id, id: t.id, name: t.name, order: ti });
      });
      g.matches.forEach((m, mi) => {
        matchDocs.push({
          tournamentId, groupId: g.id, id: m.id,
          homeId: m.homeId, awayId: m.awayId,
          homeScore: m.homeScore, awayScore: m.awayScore, played: m.played, order: mi,
        });
      });
    });

    return { tournamentDoc, groupDocs, teamDocs, matchDocs };
  }
}

module.exports = Tournament;
