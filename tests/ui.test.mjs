import test, {before, beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {balance, today} from '../dist/model.js';

// This suite exercises the real DOM event handlers in Node. It does not run a
// browser, provide visual/layout coverage, or contact any external service.
let dom, application;
const downloads = [];
const pages = ['overview', 'calendar', 'tasks', 'rewards', 'shopping', 'fairness', 'family', 'kitchen', 'settings'];
const query = selector => {
  const element = document.querySelector(selector);
  assert.ok(element, `Expected DOM element ${selector}`);
  return element;
};
function action(name, attributes = {}) {
  const suffix = Object.entries(attributes).map(([key, value]) => `[data-${key}="${value}"]`).join('');
  const element = query(`[data-action="${name}"]${suffix}`);
  assert.notEqual(element.disabled, true, `Action ${name} should be enabled`);
  element.click();
}
function profile(id) {
  const element = query('#profile-select');
  element.value = id;
  element.dispatchEvent(new window.Event('change', {bubbles: true}));
  assert.equal(query('#profile-select').value, id);
}
function navigate(page) { action('nav', {page}); }
function submit(kind, values = {}) {
  const form = query(`form[data-form="${kind}"]`);
  for (const [name, value] of Object.entries(values)) {
    const field = form.elements.namedItem(name);
    assert.ok(field, `Expected form field ${name}`);
    if (field.type === 'checkbox') field.checked = Boolean(value);
    else field.value = String(value);
  }
  form.dispatchEvent(new window.Event('submit', {bubbles: true, cancelable: true}));
  const error = document.getElementById('form-error');
  assert.ok(!error || error.hidden, `Form ${kind}: ${error?.textContent}`);
}
function reset() {
  profile('anna');
  navigate('settings');
  action('reset');
  submit('confirm');
  assert.equal(application.getState().family.name, 'Familie Sommer');
  assert.equal(query('#profile-select').value, 'anna');
}
const taskByTitle = title => application.getState().tasks.find(task => task.title === title);
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

before(async () => {
  dom = new JSDOM(await readFile(new URL('../dist/index.html', import.meta.url), 'utf8'), {
    url: 'https://familyhub-demo.test/',
    pretendToBeVisual: true,
  });
  for (const key of ['window', 'document', 'location', 'history', 'FormData']) {
    Object.defineProperty(globalThis, key, {value: dom.window[key], configurable: true, writable: true});
  }
  dom.window.scrollTo = () => {};
  dom.window.HTMLAnchorElement.prototype.click = function () {
    if (this.download) downloads.push({name: this.download, url: this.href});
  };
  application = await import('../dist/app.js');
});
beforeEach(reset);
after(() => dom.window.close());

test('every page renders for parent, child and display perspectives; display mutations remain unavailable', () => {
  for (const actorId of ['anna', 'lina', 'ben', 'kitchen']) {
    profile(actorId);
    for (const page of pages) {
      navigate(page);
      assert.equal(document.querySelectorAll('main').length, 1);
      assert.ok(query('main h1').textContent.length > 0);
      assert.doesNotMatch(query('main').textContent, /undefined|NaN|Invalid Date/);
      if (actorId === 'kitchen') {
        assert.equal(document.querySelector('main [data-action="open-task"], main [data-action="open-event"], main [data-action="open-member"], main [data-action="reward-request"], main [data-action="shopping-delete"], main [data-action="reset"]'), null);
        assert.equal(document.querySelector('main form'), null);
      }
    }
  }
  const previous = application.getState();
  assert.throws(() => application.dispatch('family.edit', {name: 'Unzulässig'}));
  assert.deepEqual(application.getState(), previous);
});

test('a parent-created task can be claimed, submitted and approved through delegated controls exactly once', () => {
  navigate('tasks');
  action('open-task');
  submit('task', {title: 'Fensterbank gemeinsam aufräumen', points: 17, difficulty: 'easy', dueDate: today(), recurrence: 'once'});
  const id = taskByTitle('Fensterbank gemeinsam aufräumen').id;
  profile('lina');
  const beforePoints = balance(application.getState(), 'lina');
  action('task-action', {id, op: 'claim'});
  assert.equal(taskByTitle('Fensterbank gemeinsam aufräumen').status, 'claimed');
  assert.equal(balance(application.getState(), 'lina'), beforePoints);
  action('task-action', {id, op: 'submit'});
  assert.equal(taskByTitle('Fensterbank gemeinsam aufräumen').status, 'submitted');
  assert.equal(balance(application.getState(), 'lina'), beforePoints);
  profile('anna');
  action('task-filter', {filter: 'submitted'});
  action('task-action', {id, op: 'approve'});
  assert.equal(taskByTitle('Fensterbank gemeinsam aufräumen').status, 'approved');
  assert.equal(balance(application.getState(), 'lina'), beforePoints + 17);
  application.dispatch('task.approve', {id}, '');
  assert.equal(balance(application.getState(), 'lina'), beforePoints + 17);
  assert.equal(application.getState().ledger.filter(entry => entry.sourceKey.includes(id)).length, 1);
  const persisted = JSON.parse(window.localStorage.getItem('familyhub-demo:data:v1'));
  assert.equal(persisted.tasks.find(task => task.id === id).status, 'approved');
});

test('reward requests reserve points; approval keeps the reservation and rejection refunds it', () => {
  navigate('rewards');
  action('open-reward');
  submit('reward', {title: 'Ein gemeinsamer Kakao', cost: 5, category: 'together', description: 'Zeit zum Reden'});
  const reward = application.getState().rewards.find(item => item.title === 'Ein gemeinsamer Kakao');
  profile('lina');
  const initial = balance(application.getState(), 'lina');
  action('reward-request', {id: reward.id});
  assert.equal(balance(application.getState(), 'lina'), initial, 'confirmation must precede reservation');
  submit('confirm');
  assert.equal(balance(application.getState(), 'lina'), initial - 5);
  let request = application.getState().redemptions.find(item => item.rewardId === reward.id && item.status === 'pending');
  profile('anna');
  action('redemption-action', {id: request.id, op: 'approve'});
  assert.equal(balance(application.getState(), 'lina'), initial - 5);
  profile('lina');
  action('reward-request', {id: reward.id});
  submit('confirm');
  assert.equal(balance(application.getState(), 'lina'), initial - 10);
  request = application.getState().redemptions.find(item => item.rewardId === reward.id && item.status === 'pending');
  profile('anna');
  action('redemption-action', {id: request.id, op: 'reject'});
  assert.equal(balance(application.getState(), 'lina'), initial - 5);
  assert.equal(application.getState().redemptions.find(item => item.id === request.id).status, 'rejected');
});

test('calendar forms create, edit and delete recurring events; mode controls preserve the data', () => {
  navigate('calendar');
  action('open-event');
  submit('event', {title: 'Gemeinsam zum Markt', date: today(), start: '10:00', end: '11:00', location: 'Marktplatz', recurrence: 'weekly', reminder: 30});
  const event = application.getState().events.find(item => item.title === 'Gemeinsam zum Markt');
  assert.equal(event.recurrence, 'weekly');
  assert.ok(event.members.includes('lina'));
  for (const mode of ['week', 'list', 'month']) {
    action('calendar-mode', {mode});
    assert.ok(query('main').textContent.includes('Gemeinsam zum Markt'));
  }
  action('open-event', {id: event.id});
  submit('event', {title: 'Gemeinsam zum Wochenmarkt', location: 'Rathausplatz'});
  assert.equal(application.getState().events.find(item => item.id === event.id).location, 'Rathausplatz');
  action('open-event', {id: event.id});
  const allDay = query('form input[name="allDay"]');
  allDay.checked = true;
  allDay.dispatchEvent(new window.Event('change', {bubbles: true}));
  assert.equal(query('form input[name="start"]').disabled, true);
  assert.equal(query('form input[name="end"]').disabled, true);
  submit('event');
  assert.equal(application.getState().events.find(item => item.id === event.id).allDay, true);
  action('open-event', {id: event.id});
  const timed = query('form input[name="allDay"]');
  timed.checked = false;
  timed.dispatchEvent(new window.Event('change', {bubbles: true}));
  assert.equal(query('form input[name="start"]').disabled, false);
  submit('event', {start: '11:00', end: '12:00'});
  assert.equal(application.getState().events.find(item => item.id === event.id).allDay, false);
  action('calendar-mode', {mode: 'list'});
  action('event-delete', {id: event.id});
  assert.ok(application.getState().events.some(item => item.id === event.id));
  submit('confirm');
  assert.equal(application.getState().events.some(item => item.id === event.id), false);
});

test('children can manage multiple shopping lists and edit, toggle and remove individual items', () => {
  profile('lina');
  navigate('shopping');
  action('open-list');
  submit('list', {name: 'Picknick am Sonntag'});
  const list = application.getState().shoppingLists.find(item => item.name === 'Picknick am Sonntag');
  action('select-list', {id: list.id});
  submit('shopping-item', {name: 'Birnen', quantity: '4 Stück', category: 'Obst & Gemüse'});
  let item = application.getState().shoppingLists.find(entry => entry.id === list.id).items[0];
  assert.equal(item.name, 'Birnen');
  action('shopping-toggle', {id: item.id, list: list.id});
  assert.equal(application.getState().shoppingLists.find(entry => entry.id === list.id).items[0].checked, true);
  action('open-shopping-item', {id: item.id, list: list.id});
  submit('shopping-edit', {name: 'Äpfel', quantity: '6 Stück', category: 'Obst & Gemüse'});
  item = application.getState().shoppingLists.find(entry => entry.id === list.id).items[0];
  assert.equal(item.name, 'Äpfel');
  assert.equal(item.quantity, '6 Stück');
  assert.equal(item.checked, true, 'editing preserves checked state');
  action('select-list', {id: 'list_week'});
  assert.equal(query('main').textContent.includes('Picknick am Sonntag'), true, 'other list remains accessible');
  action('select-list', {id: list.id});
  action('shopping-delete', {id: item.id, list: list.id});
  assert.equal(application.getState().shoppingLists.find(entry => entry.id === list.id).items.length, 0);
  assert.equal(document.querySelector('[data-action="delete-list"]'), null, 'whole-list deletion is parent-only');
});

test('family profiles, personal targets and reasoned point adjustments work through forms', () => {
  navigate('family');
  action('open-family');
  submit('family', {name: 'Familie Sonnenblume', weeklyBonus: 22});
  assert.equal(application.getState().family.weeklyBonus, 22);
  assert.ok(query('main').textContent.includes('Familie Sonnenblume'));
  action('open-member');
  submit('member', {name: 'Mia', role: 'child', age: 7, weeklyTarget: 20, color: '#a2634a'});
  const member = application.getState().members.find(item => item.name === 'Mia');
  assert.ok(query('#profile-select').querySelector(`option[value="${member.id}"]`));
  action('open-member', {id: member.id});
  submit('member', {weeklyTarget: 30});
  assert.equal(application.getState().members.find(item => item.id === member.id).weeklyTarget, 30);
  navigate('rewards');
  const beforePoints = balance(application.getState(), 'lina');
  action('open-adjust', {id: 'lina'});
  submit('adjust', {memberId: 'lina', amount: 9, reason: 'Beim Picknick vorbereiten geholfen'});
  assert.equal(balance(application.getState(), 'lina'), beforePoints + 9);
  assert.ok(application.getState().ledger.some(item => item.amount === 9 && item.reason === 'Beim Picknick vorbereiten geholfen'));
  navigate('family');
  action('remove-member', {id: member.id});
  submit('confirm');
  assert.equal(application.getState().members.some(item => item.id === member.id), false);
});

test('user text stays text in task cards, dialogs and live search', () => {
  navigate('tasks');
  action('task-filter', {filter: 'active'});
  action('open-task');
  const title = '<img src=x onerror="globalThis.pwned=true"> & Familie';
  submit('task', {title, dueDate: today()});
  const task = taskByTitle(title);
  assert.ok(task);
  assert.equal(document.querySelector('img[src="x"]'), null);
  assert.ok(query('main').textContent.includes(title));
  const field = query('input[name="search"]');
  field.focus();
  field.value = '<img';
  field.dispatchEvent(new window.Event('input', {bubbles: true}));
  assert.equal(query('input[name="search"]').value, '<img');
  assert.equal(document.activeElement, query('input[name="search"]'));
  assert.ok(query('main').textContent.includes(title));
  action('open-task', {id: task.id});
  assert.equal(query('form input[name="title"]').value, title);
  assert.equal(document.querySelector('img[src="x"]'), null);
  assert.equal(globalThis.pwned, undefined);
});

test('calendar import is an explicit, repeat-safe simulation with no account connection', () => {
  navigate('calendar');
  const initial = application.getState().events.length;
  action('simulated-import');
  assert.match(query('#modal').textContent, /kein Google- oder Nextcloud-Konto/);
  submit('simulation');
  assert.equal(application.getState().events.length, initial + 2);
  action('simulated-import');
  submit('simulation');
  assert.equal(application.getState().events.length, initial + 2);
});

test('JSON export/import and reset preserve only the visitor’s local demo state', async () => {
  navigate('family');
  action('open-family');
  submit('family', {name: 'Familie Exporttest'});
  const snapshot = JSON.stringify(application.getState());
  navigate('settings');
  action('export');
  assert.match(downloads.at(-1).name, /^FamilyHub-Demo-\d{4}-\d{2}-\d{2}\.json$/);
  const exported = await fetch(downloads.at(-1).url).then(response => response.json());
  assert.equal(exported.family.name, 'Familie Exporttest');
  reset();
  navigate('settings');
  const input = query('#import-data');
  Object.defineProperty(input, 'files', {value: [{name: 'demo.json', size: snapshot.length, text: async () => snapshot}]});
  input.dispatchEvent(new window.Event('change', {bubbles: true}));
  await flush();
  assert.equal(application.getState().family.name, 'Familie Sommer', 'import requires local confirmation');
  submit('confirm');
  assert.equal(application.getState().family.name, 'Familie Exporttest');
  assert.equal(JSON.parse(window.localStorage.getItem('familyhub-demo:data:v1')).family.name, 'Familie Exporttest');
  reset();
});
