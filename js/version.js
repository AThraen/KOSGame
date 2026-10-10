// Build version. Committed with dev values; the deploy workflow (.github/workflows/pages.yml) overwrites this file
// before the precache is generated: tag v* -> channel 'prod', main -> channel 'test' (version = last tag + short sha).
(function (g) {
  const KOS = g.KOS = g.KOS || {};
  KOS.BUILD = { version: 'dev', channel: 'dev', sha: '', date: '' };
})(typeof window !== 'undefined' ? window : globalThis);
