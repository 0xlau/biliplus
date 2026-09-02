const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'settings', 'js', 'settings.js'),
  'utf8'
);
const plain = value => JSON.parse(JSON.stringify(value));

function createFixture({ granted = true, persisted = false } = {}) {
  const requests = [];
  const removals = [];
  const saves = [];
  const label = { textContent: '' };
  const saveState = {
    dataset: {},
    querySelector() { return label; },
  };
  const row = {
    attributes: new Map(),
    setAttribute(name, value) { this.attributes.set(name, value); },
  };
  const element = {
    type: 'checkbox',
    checked: !persisted,
    dataset: { setting: 'invalid-video-info' },
    closest() { return row; },
  };
  const context = vm.createContext({
    console,
    document: {
      body: { dataset: {}, setAttribute() {} },
      getElementById(id) { return id === 'save-state' ? saveState : null; },
      querySelectorAll() { return []; },
      addEventListener() {},
    },
    chrome: {
      permissions: {
        async request(value) { requests.push(value); return granted; },
        async remove(value) { removals.push(value); return true; },
        async contains() { return granted; },
      },
      storage: {
        sync: {
          async set(value) { saves.push(value); },
        },
      },
      runtime: { async sendMessage() { return { ok: true }; } },
    },
    IntersectionObserver: class {},
  });
  vm.runInContext(source, context);
  vm.runInContext(`persistedValues.set('invalid-video-info', ${persisted})`, context);
  const state = { desiredValue: persisted, saving: false };
  const handle = vm.runInContext('handleInvalidVideoChange', context);
  return { context, element, state, handle, requests, removals, saves, label };
}

test('enabling invalid-video restoration requests both optional origins before saving', async () => {
  const fixture = createFixture({ granted: true, persisted: false });
  fixture.element.checked = true;
  await fixture.handle(fixture.element, fixture.state, true);
  assert.deepEqual(plain(fixture.requests), [{ origins: [
    'https://www.biliplus.com/*',
    'https://www.jijidown.com/*',
  ] }]);
  assert.deepEqual(plain(fixture.saves), [{ 'invalid-video-info': true }]);
  assert.equal(fixture.state.desiredValue, true);
});

test('denied archive permission leaves the feature disabled and unsaved', async () => {
  const fixture = createFixture({ granted: false, persisted: false });
  fixture.element.checked = true;
  await fixture.handle(fixture.element, fixture.state, true);
  assert.equal(fixture.element.checked, false);
  assert.equal(fixture.state.desiredValue, false);
  assert.deepEqual(plain(fixture.saves), []);
  assert.match(fixture.label.textContent, /未授予/);
});

test('disabling restoration saves off and removes optional origins', async () => {
  const fixture = createFixture({ granted: true, persisted: true });
  fixture.element.checked = false;
  await fixture.handle(fixture.element, fixture.state, false);
  assert.equal(fixture.removals.length, 1);
  assert.deepEqual(plain(fixture.saves), [{ 'invalid-video-info': false }]);
});
