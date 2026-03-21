/* ─── utils/fuzzy-match.js ─── */
(function(global) {
  // Check if we're in a browser environment
  const isBrowser = typeof window !== 'undefined';
  
  if (!isBrowser) {
    // Export empty object for Node.js testing
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = { score: () => 0, best: () => null };
    }
    return;
  }

  const FuzzyMatch = (() => {
  // Levenshtein distance
  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        dp[i][j] = a[i-1] === b[j-1]
          ? dp[i-1][j-1]
          : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    return dp[m][n];
  }

  // Normalise string for comparison
  function norm(s) {
    return String(s || '').toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Token-set ratio (handles word order)
  function tokenSetRatio(a, b) {
    const ta = new Set(norm(a).split(' ').filter(Boolean));
    const tb = new Set(norm(b).split(' ').filter(Boolean));
    const inter = [...ta].filter(t => tb.has(t));
    const union = new Set([...ta, ...tb]);
    return union.size === 0 ? 0 : inter.length / union.size;
  }

  // Substring bonus
  function substringScore(a, b) {
    const na = norm(a), nb = norm(b);
    if (na === nb) return 1;
    if (na.includes(nb) || nb.includes(na)) return 0.85;
    return 0;
  }

  // Combined similarity score [0–1]
  function score(a, b) {
    if (!a || !b) return 0;
    const na = norm(a), nb = norm(b);
    if (!na || !nb) return 0;
    const sub = substringScore(na, nb);
    if (sub >= 0.85) return sub;
    const tsr = tokenSetRatio(na, nb);
    const maxLen = Math.max(na.length, nb.length);
    const lev = maxLen ? 1 - levenshtein(na, nb) / maxLen : 0;
    return Math.max(tsr * 0.6 + lev * 0.4, sub);
  }

  // Find best match from candidates
  function best(query, candidates, key = null, threshold = 0.4) {
    let best = null, bestScore = 0;
    for (const c of candidates) {
      const text = key ? c[key] : c;
      const s = score(query, text);
      if (s > bestScore) { bestScore = s; best = c; }
    }
    return bestScore >= threshold ? { match: best, score: bestScore } : null;
  }

  return { score, best, norm, tokenSetRatio };
})();

// Export for both environments
if (isBrowser) {
  window.FuzzyMatch = FuzzyMatch;
} else if (typeof module !== 'undefined' && module.exports) {
  module.exports = FuzzyMatch;
}

})(typeof window !== 'undefined' ? window : global);
