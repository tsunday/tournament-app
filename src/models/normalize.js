'use strict';

/**
 * Wspólne funkcje normalizujące dane wejściowe modeli.
 * Modele nie ufają danym z klienta — wszystko przechodzi przez te helpery.
 */

// Liczba całkowita lub wartość domyślna, gdy wejście jest nieprawidłowe.
function intOr(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

// Wynik meczu: null (niewpisany) albo nieujemna liczba całkowita.
function normalizeScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, n);
}

// String z wartością domyślną dla null/undefined.
function str(value, fallback = '') {
  return value === null || value === undefined ? fallback : String(value);
}

// Identyfikator: string albo null (np. nieobsadzony uczestnik drabinki).
function idOrNull(value) {
  return value === null || value === undefined ? null : String(value);
}

module.exports = { intOr, normalizeScore, str, idOrNull };
