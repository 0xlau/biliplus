const test = require('node:test');
const assert = require('node:assert/strict');

const status = require('../scripts/information-cocoon-status.js');

test('page status reflects the effective master and privacy switches', () => {
  assert.equal(
    status.isEnabled({
      'biliplus-enable': true,
      'reject-information-cocoon': true,
    }),
    true,
  );
  assert.equal(
    status.isEnabled({
      'biliplus-enable': false,
      'reject-information-cocoon': true,
    }),
    false,
  );
});

test('page diagnostics distinguish installed, unmatched, and unavailable rules', () => {
  assert.equal(
    status.getRuleState({ ok: true, enabled: true, ruleCount: 9 }),
    'active',
  );
  assert.equal(
    status.getRuleState({ ok: true, enabled: true, ruleCount: 0 }),
    'error',
  );
  assert.equal(status.getRuleState({ ok: false }), 'error');
  assert.equal(status.getMatchState({ recommendationMatches: true }), 'yes');
  assert.equal(status.getMatchState({ recommendationMatches: false }), 'no');
  assert.equal(status.getMatchState({ recommendationMatches: null }), 'unknown');
});
