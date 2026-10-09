// KØS SEJL — js/modes-ready.js
// Last (deferred) script in index.html: every js/modes/*.js has run, so the activities exist. See js/main.js.
(function (root) {
  if (root.KOS && root.KOS.Boot) root.KOS.Boot.modesReady();
})(typeof window !== 'undefined' ? window : globalThis);
