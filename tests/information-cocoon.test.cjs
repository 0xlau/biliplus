const test = require('node:test');
const assert = require('node:assert/strict');

const cocoon = require('../scripts/background/information-cocoon.js');

test('mode requires both the master switch and its own switch', () => {
  assert.equal(
    cocoon.shouldEnable({
      'biliplus-enable': true,
      'reject-information-cocoon': true,
    }),
    true,
  );
  assert.equal(
    cocoon.shouldEnable({
      'biliplus-enable': false,
      'reject-information-cocoon': true,
    }),
    false,
  );
});

test('rules remove only Cookie from explicit discovery XHR endpoints', () => {
  const rules = cocoon.buildRules();
  assert.equal(rules.length, cocoon.DISCOVERY_ENDPOINTS.length);

  rules.forEach((rule, index) => {
    assert.equal(rule.priority, cocoon.RULE_PRIORITY);
    assert.deepEqual(rule.action, {
      type: 'modifyHeaders',
      requestHeaders: [{ header: 'cookie', operation: 'remove' }],
    });
    assert.deepEqual(rule.condition.resourceTypes, ['xmlhttprequest']);
    assert.deepEqual(rule.condition.requestDomains, ['api.bilibili.com']);
    assert.equal(rule.condition.urlFilter, cocoon.DISCOVERY_ENDPOINTS[index]);
    assert.doesNotMatch(
      rule.condition.urlFilter,
      /\/nav|\/player|\/history|\/coin|\/fav|\/like|\/reply/,
    );
  });
});

test('sync atomically installs and removes the owned dynamic rules', async () => {
  const updates = [];
  let dynamicRules = [{ id: 999, action: { type: 'block' }, condition: {} }];
  const chromeApi = {
    declarativeNetRequest: {
      async updateDynamicRules(update) {
        updates.push(update);
        dynamicRules = dynamicRules
          .filter(rule => !update.removeRuleIds.includes(rule.id))
          .concat(update.addRules);
      },
      async getDynamicRules() {
        return dynamicRules;
      },
    },
    storage: {
      sync: {
        async get() {
          return {
            'biliplus-enable': true,
            'reject-information-cocoon': true,
          };
        },
      },
    },
  };

  assert.equal(await cocoon.syncRules(chromeApi), true);
  assert.deepEqual(updates[0].removeRuleIds, [...cocoon.RULE_IDS]);
  assert.equal(updates[0].addRules.length, cocoon.RULE_IDS.length);

  assert.equal(
    await cocoon.syncRules(chromeApi, {
      'biliplus-enable': true,
      'reject-information-cocoon': false,
    }),
    false,
  );
  assert.deepEqual(updates[1], {
    removeRuleIds: [...cocoon.RULE_IDS],
    addRules: [],
  });
  assert.deepEqual(dynamicRules.map(rule => rule.id), [999]);
});

test('owned-rule verification ignores dynamic rules from other features', async () => {
  const ownedRules = await cocoon.getOwnedRules({
    declarativeNetRequest: {
      async getDynamicRules() {
        return [
          { id: 999 },
          { id: cocoon.RULE_IDS[0] },
          { id: cocoon.RULE_IDS.at(-1) },
        ];
      },
    },
  });

  assert.deepEqual(
    ownedRules.map(rule => rule.id),
    [cocoon.RULE_IDS[0], cocoon.RULE_IDS.at(-1)],
  );
});

test('runtime diagnostics verify that recommendation requests match an installed rule', async () => {
  const status = await cocoon.getRuleStatus(
    {
      declarativeNetRequest: {
        async getDynamicRules() {
          return cocoon.buildRules();
        },
        async testMatchOutcome(details) {
          assert.deepEqual(details, {
            url: cocoon.RECOMMENDATION_PROBE_URL,
            type: 'xmlhttprequest',
            initiator: 'https://www.bilibili.com',
          });
          return {
            matchedRules: [{ ruleId: cocoon.RULE_IDS[0], rulesetId: '_dynamic' }],
          };
        },
      },
    },
    true,
  );

  assert.deepEqual(status, {
    enabled: true,
    ruleCount: cocoon.RULE_IDS.length,
    recommendationMatches: true,
  });
});
