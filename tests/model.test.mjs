import test from 'node:test';
import assert from 'node:assert/strict';
import {
  seedState, reduce, validateState, importState, balance, getFairness,
  getEvents, today, addDays, materialize,
} from '../dist/model.js';

const NOW = new Date('2026-11-07T12:00:00.000Z');
const DAY = '2026-11-07';
let serial = 0;
const fresh = () => seedState(NOW);
const apply = (state, actor, action, payload = {}, now = NOW) => reduce(state, actor, action, payload, now);

function createTask(state, values = {}) {
  const title = `Testaufgabe ${++serial}`;
  const next = apply(state, 'anna', 'task.create', {
    title, description: 'Eine Aufgabe für den Modelltest.', points: 10,
    difficulty: 'easy', recurrence: 'once', dueDate: DAY, ...values,
  });
  const task = next.tasks.find(item => item.title === (values.title || title) && item.dueDate === (values.dueDate || DAY));
  assert.ok(task, 'task.create creates a task occurrence');
  return [next, task.id];
}

function finish(state, id, memberId = 'lina', now = NOW) {
  state = apply(state, memberId, 'task.claim', { id }, now);
  state = apply(state, memberId, 'task.submit', { id }, now);
  return apply(state, 'anna', 'task.approve', { id }, now);
}

// Replays may be a no-op or an explicit invalid-transition error. Either is safe.
function replay(state, actor, action, payload, now = NOW) {
  try { return apply(state, actor, action, payload, now); }
  catch (error) {
    assert.ok(error instanceof Error);
    return state;
  }
}

function entriesForTask(state, id) {
  return state.ledger.filter(entry => String(entry.sourceKey).includes(id));
}

test('seed data is valid, isolated, and survives a plain JSON export/import', () => {
  const state = fresh();
  assert.equal(state.schema, 1);
  assert.equal(state.family.name, 'Familie Sommer');
  assert.equal(state.family.timezone, 'Europe/Berlin');
  assert.deepEqual(state.members.map(member => member.id).sort(), ['anna', 'ben', 'kitchen', 'lina', 'tom']);
  assert.ok(state.tasks.length >= 5);
  assert.ok(state.rewards.length >= 4);
  assert.ok(state.shoppingLists.length >= 2);
  assert.deepEqual(importState(JSON.stringify(state)), state);
  assert.deepEqual(validateState(state), state);
  const imported = importState(JSON.stringify(state));
  imported.family.name = 'Andere Familie';
  assert.equal(state.family.name, 'Familie Sommer');
  for (const member of state.members) {
    assert.equal(balance(state, member.id), state.ledger.filter(entry => entry.memberId === member.id).reduce((sum, entry) => sum + entry.amount, 0));
  }
});

test('Berlin dates and date arithmetic handle midnight, month ends, and leap days', () => {
  assert.equal(today(new Date('2026-11-07T23:30:00Z')), '2026-11-08');
  assert.equal(today(new Date('2026-03-28T23:30:00Z')), '2026-03-29');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2028-02-29', 1), '2028-03-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('display profiles are read-only and children cannot manage household settings', () => {
  let state, taskId;
  [state, taskId] = createTask(fresh());
  const before = JSON.stringify(state);
  assert.throws(() => apply(state, 'kitchen', 'task.claim', { id: taskId }));
  assert.throws(() => apply(state, 'lina', 'task.create', { title: 'Nicht erlaubt', points: 1, difficulty: 'easy', recurrence: 'once', dueDate: DAY }));
  assert.throws(() => apply(state, 'ben', 'family.edit', { name: 'Neu', weeklyBonus: 50 }));
  assert.throws(() => apply(state, 'lina', 'reward.create', { title: 'Gratis', cost: 1, category: 'experience', description: '' }));
  assert.throws(() => apply(state, 'unknown', 'task.claim', { id: taskId }));
  assert.equal(JSON.stringify(state), before, 'rejected actions do not mutate their input');
});

test('age permissions and task ownership are enforced', () => {
  let state, hardId;
  [state, hardId] = createTask(fresh(), { difficulty: 'hard' });
  assert.throws(() => apply(state, 'ben', 'task.claim', { id: hardId }));
  state = apply(state, 'lina', 'task.claim', { id: hardId });
  assert.equal(state.tasks.find(task => task.id === hardId).assigneeId, 'lina');
  assert.throws(() => apply(state, 'ben', 'task.submit', { id: hardId }));
  assert.throws(() => apply(state, 'ben', 'task.release', { id: hardId }));
  assert.throws(() => apply(state, 'lina', 'task.approve', { id: hardId }));
});

test('approval credits one immutable task snapshot and keeps reducer input unchanged', () => {
  let state, taskId;
  [state, taskId] = createTask(fresh(), { points: 11 });
  const before = structuredClone(state);
  const initialBalance = balance(state, 'lina');
  state = finish(state, taskId);
  assert.deepEqual(before.tasks.find(task => task.id === taskId).status, 'open');
  assert.equal(balance(state, 'lina'), initialBalance + 11);
  assert.equal(state.tasks.find(task => task.id === taskId).status, 'approved');
  assert.ok(state.tasks.find(task => task.id === taskId).approvedAt);
  const ledgerSize = state.ledger.length;
  state = replay(state, 'anna', 'task.approve', { id: taskId });
  assert.equal(balance(state, 'lina'), initialBalance + 11);
  assert.equal(state.ledger.length, ledgerSize);
  assert.ok(entriesForTask(state, taskId).length <= 1);
});

test('reward requests reserve points, approval never debits twice, and rejection refunds once', () => {
  let state = apply(fresh(), 'anna', 'points.adjust', { memberId: 'lina', amount: 1000, reason: 'Testguthaben' });
  const reward = state.rewards.find(item => item.active && item.cost > 0);
  assert.ok(reward);
  const initialBalance = balance(state, 'lina');
  const originalIds = new Set(state.redemptions.map(item => item.id));
  state = apply(state, 'lina', 'reward.request', { id: reward.id });
  let redemption = state.redemptions.find(item => !originalIds.has(item.id));
  assert.ok(redemption);
  assert.equal(redemption.memberId, 'lina');
  assert.equal(redemption.status, 'pending');
  assert.equal(balance(state, 'lina'), initialBalance - reward.cost);
  assert.throws(() => apply(state, 'lina', 'redemption.approve', { id: redemption.id }));
  state = apply(state, 'anna', 'redemption.approve', { id: redemption.id });
  state = replay(state, 'anna', 'redemption.approve', { id: redemption.id });
  assert.equal(balance(state, 'lina'), initialBalance - reward.cost);

  const approvedId = redemption.id;
  const existing = new Set(state.redemptions.map(item => item.id));
  state = apply(state, 'lina', 'reward.request', { id: reward.id });
  redemption = state.redemptions.find(item => !existing.has(item.id));
  assert.equal(balance(state, 'lina'), initialBalance - reward.cost * 2);
  state = apply(state, 'anna', 'redemption.reject', { id: redemption.id });
  state = replay(state, 'anna', 'redemption.reject', { id: redemption.id });
  assert.equal(balance(state, 'lina'), initialBalance - reward.cost);
  state = replay(state, 'anna', 'redemption.reject', { id: approvedId });
  assert.equal(balance(state, 'lina'), initialBalance - reward.cost);
});

test('insufficient points cannot be spent and point corrections require a reason', () => {
  const state = fresh();
  const memberId = 'ben';
  const available = balance(state, memberId);
  const expensive = { id: 'test-expensive-reward', title: 'Zu teuer', cost: Math.max(available + 1, 999), category: 'experience', description: '', active: true };
  const costlyState = { ...state, rewards: [...state.rewards, expensive] };
  assert.throws(() => apply(costlyState, memberId, 'reward.request', { id: expensive.id }));
  assert.throws(() => apply(state, memberId, 'points.adjust', { memberId, amount: 50, reason: 'Eigenes Geschenk' }));
  assert.throws(() => apply(state, 'anna', 'points.adjust', { memberId, amount: 5, reason: '' }));
});

test('weekly fairness uses personal permitted difficulties and awards the bonus once', () => {
  let state = fresh();
  const member = state.members.find(item => item.id === 'lina');
  const initial = getFairness(state, NOW).find(item => item.memberId === member.id);
  assert.ok(initial);
  assert.equal(initial.target, member.weeklyTarget);
  for (const difficulty of member.allowedDifficulties) {
    let id;
    [state, id] = createTask(state, { difficulty });
    state = finish(state, id);
  }
  let fair = getFairness(state, NOW).find(item => item.memberId === member.id);
  assert.equal(fair.eligible, true);
  assert.deepEqual(fair.needed, []);
  for (const difficulty of member.allowedDifficulties) assert.ok(fair.counts[difficulty] >= 1);
  const before = balance(state, member.id);
  const wasAwarded = fair.bonusAwarded;
  state = apply(state, member.id, 'bonus.claim', { memberId: member.id });
  assert.equal(balance(state, member.id), before + (wasAwarded ? 0 : state.family.weeklyBonus));
  state = replay(state, member.id, 'bonus.claim', { memberId: member.id });
  assert.equal(balance(state, member.id), before + (wasAwarded ? 0 : state.family.weeklyBonus));
  fair = getFairness(state, NOW).find(item => item.memberId === member.id);
  assert.equal(fair.bonusAwarded, true);
  const nextWeek = getFairness(state, new Date('2026-11-09T12:00:00Z')).find(item => item.memberId === member.id);
  assert.equal(nextWeek.eligible, false);
  assert.equal(nextWeek.bonusAwarded, false);
});

test('editing recurring tasks preserves approved history and modifies open future work', () => {
  let state, id;
  [state, id] = createTask(fresh(), { title: 'Serien-Test', recurrence: 'daily', points: 7 });
  state = finish(state, id);
  const approved = structuredClone(state.tasks.find(item => item.id === id));
  const originalBalance = balance(state, 'lina');
  state = materialize(state, new Date('2026-11-10T12:00:00Z'));
  const openTask = state.tasks.find(item => item.seriesId === approved.seriesId && item.status === 'open' && item.dueDate > DAY);
  assert.ok(openTask, 'a daily series gets future occurrences when time advances');
  state = apply(state, 'anna', 'task.edit', { id: openTask.id, title: 'Neue Fassung', points: 19 }, new Date('2026-11-10T12:00:00Z'));
  assert.deepEqual(state.tasks.find(item => item.id === id), approved);
  assert.equal(balance(state, 'lina'), originalBalance);
  assert.equal(state.tasks.find(item => item.id === openTask.id).title, 'Neue Fassung');
  assert.equal(state.tasks.find(item => item.id === openTask.id).points, 19);
  const twice = materialize(state, new Date('2026-11-10T12:00:00Z'));
  const occurrenceKeys = twice.tasks.filter(item => item.seriesId === approved.seriesId).map(item => `${item.seriesId}:${item.dueDate}`);
  assert.equal(new Set(occurrenceKeys).size, occurrenceKeys.length, 'materialization is idempotent');
});

test('monthly and yearly calendar recurrences preserve their anchor through short months', () => {
  const state = fresh();
  state.events = [
    { id: 'month-end', title: 'Monatsende', date: '2028-01-31', start: '16:00', end: '17:00', allDay: false, members: ['lina'], recurrence: 'monthly', location: '', reminder: 15 },
    { id: 'leap-day', title: 'Schalttag', date: '2028-02-29', start: '16:00', end: '17:00', allDay: false, members: ['ben'], recurrence: 'yearly', location: '', reminder: 15 },
  ];
  const events = getEvents(state, '2028-01-01', '2028-04-30');
  assert.deepEqual(events.filter(event => event.id === 'month-end').map(event => event.occurrenceDate || event.date), ['2028-01-31', '2028-02-29', '2028-03-31', '2028-04-30']);
  const leap = getEvents(state, '2029-01-01', '2029-12-31').find(event => event.id === 'leap-day');
  assert.equal(leap?.occurrenceDate || leap?.date, '2029-02-28');
  assert.equal(state.events[0].date, '2028-01-31');
});

test('series archive keeps claimed and submitted work while removing open occurrences', () => {
  let state, id;
  [state, id] = createTask(fresh(), { recurrence: 'daily' });
  state = apply(state, 'ben', 'task.claim', { id });
  const seriesId = state.tasks.find(task => task.id === id).seriesId;
  state = materialize(state, new Date('2026-11-09T12:00:00Z'));
  state = apply(state, 'anna', 'series.archive', { id: seriesId }, new Date('2026-11-09T12:00:00Z'));
  assert.equal(state.tasks.find(task => task.id === id).status, 'claimed');
  assert.equal(state.tasks.some(task => task.seriesId === seriesId && task.status === 'open'), false);
  assert.equal(state.taskSeries.find(series => series.id === seriesId)?.active, false);
});

test('validation rejects malformed dates, references, enums, unsafe objects, and duplicate IDs', () => {
  const cases = [];
  let state = fresh();
  state.family.weeklyBonus = Infinity;
  cases.push(state);
  state = fresh();
  state.members[0].color = 'url(javascript:alert(1))';
  cases.push(state);
  state = fresh();
  state.tasks[0].dueDate = '2026-02-30';
  cases.push(state);
  state = fresh();
  state.tasks[0].assigneeId = 'missing-member';
  cases.push(state);
  state = fresh();
  state.tasks[0].difficulty = 'impossible';
  cases.push(state);
  state = fresh();
  state.members.push({ ...state.members[0] });
  cases.push(state);
  state = fresh();
  state.family.name = 'x'.repeat(10000);
  cases.push(state);
  for (const invalid of cases) assert.throws(() => validateState(invalid));
  const poisoned = JSON.stringify(fresh()).replace('"family":{', '"family":{"__proto__":{"polluted":true},');
  assert.throws(() => importState(poisoned));
  assert.throws(() => importState('{broken json'));
  assert.throws(() => importState({ ...fresh(), schema: 999 }));
  assert.equal({}.polluted, undefined);
});

test('untrusted object accessors, functions, prototypes, and symbols are rejected without invocation', () => {
  let invoked = false;
  const withGetter = fresh();
  Object.defineProperty(withGetter.family, 'name', { enumerable: true, get() { invoked = true; return 'getter'; } });
  assert.throws(() => validateState(withGetter));
  assert.equal(invoked, false);
  const withFunction = fresh();
  withFunction.family.name = () => 'not data';
  assert.throws(() => validateState(withFunction));
  const withPrototype = fresh();
  Object.setPrototypeOf(withPrototype.family, { inherited: 'not plain' });
  assert.throws(() => validateState(withPrototype));
  const withSymbol = fresh();
  withSymbol.family[Symbol('hidden')] = 'not JSON';
  assert.throws(() => validateState(withSymbol));
  const withBigInt = fresh();
  withBigInt.family.weeklyBonus = 15n;
  assert.throws(() => validateState(withBigInt));
  const cyclic = fresh();
  cyclic.family.loop = cyclic;
  assert.throws(() => validateState(cyclic));
});

test('imports reject impossible timestamps and preserve journal referential consistency', () => {
  let state = fresh();
  const approved = state.tasks.find(task => task.status === 'approved');
  approved.approvedAt = '2026-02-30T12:00:00.000Z';
  state.ledger.find(entry => entry.sourceKey === `task:${approved.id}`).createdAt = approved.approvedAt;
  assert.throws(() => validateState(state));
  state = fresh();
  state.ledger.find(entry => entry.sourceKey.startsWith('task:')).amount += 1;
  assert.throws(() => validateState(state));
  state = fresh();
  state.ledger.push({ ...state.ledger[0], id: 'duplicate-source-entry' });
  assert.throws(() => validateState(state));
  state = fresh();
  state.ledger.push({ id: 'orphan-task-entry', memberId: 'lina', amount: 10, reason: 'Verwaiste Aufgabe', sourceKey: 'task:missing-task', createdAt: NOW.toISOString() });
  assert.throws(() => validateState(state));
});

test('duplicate recurring occurrence keys and display task assignments are rejected', () => {
  let state = fresh();
  const open = state.tasks.find(task => task.status === 'open');
  state.tasks.push({ ...open, id: 'duplicate-occurrence-task' });
  assert.throws(() => validateState(state));
  state = fresh();
  const task = state.tasks.find(item => item.status === 'open');
  task.status = 'claimed';
  task.assigneeId = 'kitchen';
  assert.throws(() => validateState(state));
});

test('materialization previews seven days without duplicate tasks on repeated calls', () => {
  let state, id;
  [state, id] = createTask(fresh(), { recurrence: 'daily' });
  const seriesId = state.tasks.find(task => task.id === id).seriesId;
  state = materialize(state, NOW);
  const dates = state.tasks.filter(task => task.seriesId === seriesId).map(task => task.dueDate).sort();
  assert.deepEqual(dates, Array.from({ length: 8 }, (_, offset) => addDays(DAY, offset)));
  const again = materialize(state, NOW);
  assert.deepEqual(again.tasks.filter(task => task.seriesId === seriesId), state.tasks.filter(task => task.seriesId === seriesId));
});

test('monthly tasks keep their original day through leap February and first Saturdays stay Saturdays', () => {
  const janNow = new Date('2028-01-31T12:00:00Z');
  let state = fresh();
  state = apply(state, 'anna', 'task.create', { title: 'Monatsanker', description: '', points: 10, difficulty: 'easy', recurrence: 'monthly', dueDate: '2028-01-31' }, janNow);
  const monthly = state.taskSeries.find(series => series.title === 'Monatsanker');
  state = materialize(state, new Date('2028-04-30T12:00:00Z'));
  assert.deepEqual(state.tasks.filter(task => task.seriesId === monthly.id).map(task => task.dueDate).sort(), ['2028-01-31', '2028-02-29', '2028-03-31', '2028-04-30']);
  state = apply(state, 'anna', 'task.create', { title: 'Erster Samstag', description: '', points: 10, difficulty: 'easy', recurrence: 'firstSaturday', dueDate: '2028-01-01' }, janNow);
  const saturday = state.taskSeries.find(series => series.title === 'Erster Samstag');
  state = materialize(state, new Date('2028-04-30T12:00:00Z'));
  assert.deepEqual(state.tasks.filter(task => task.seriesId === saturday.id).map(task => task.dueDate).sort(), ['2028-01-01', '2028-02-05', '2028-03-04', '2028-04-01', '2028-05-06']);
});

test('new weekday and first-Saturday series begin on the next matching schedule date', () => {
  const now = new Date('2028-01-20T12:00:00Z');
  let state = apply(fresh(), 'anna', 'task.create', { title: 'Passender Samstag', description: '', points: 10, difficulty: 'easy', recurrence: 'firstSaturday', dueDate: '2028-01-20' }, now);
  const saturdaySeries = state.taskSeries.find(series => series.title === 'Passender Samstag');
  assert.equal(saturdaySeries.dueDate, '2028-01-20', 'series retains its original recurrence anchor');
  assert.deepEqual(state.tasks.filter(task => task.seriesId === saturdaySeries.id).map(task => task.dueDate), ['2028-02-05']);
  state = apply(state, 'anna', 'task.create', { title: 'Passender Wochentag', description: '', points: 10, difficulty: 'easy', recurrence: 'weekdays', dueDate: '2028-01-22' }, now);
  const weekdaySeries = state.taskSeries.find(series => series.title === 'Passender Wochentag');
  assert.equal(weekdaySeries.dueDate, '2028-01-22');
  assert.deepEqual(state.tasks.filter(task => task.seriesId === weekdaySeries.id).map(task => task.dueDate), ['2028-01-24']);
});

test('releasing claimed work from an archived series removes the resulting open occurrence', () => {
  let state, id;
  [state, id] = createTask(fresh(), { recurrence: 'daily' });
  state = apply(state, 'ben', 'task.claim', { id });
  const seriesId = state.tasks.find(task => task.id === id).seriesId;
  state = apply(state, 'anna', 'series.archive', { id: seriesId });
  assert.equal(state.tasks.find(task => task.id === id)?.status, 'claimed');
  state = apply(state, 'ben', 'task.release', { id });
  assert.equal(state.tasks.some(task => task.seriesId === seriesId && task.status === 'open'), false);
  assert.equal(state.tasks.some(task => task.id === id), false);
});
