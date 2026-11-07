/** FamilyHub Demo: all data and simulated permissions stay in this browser. */
export const SCHEMA_VERSION = 1;
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const RECURRENCES = ['once', 'daily', 'weekdays', 'weekly', 'monthly', 'firstSaturday', 'yearly'];
const CATEGORIES = ['experience', 'money', 'screen', 'together'];
const DAY = 86400000;
const fail = message => { throw new Error(message); };
const check = (condition, message) => { if (!condition) fail(message); };
const clone = value => structuredClone(value);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export function today(now = new Date()) {
  const date = new Date(now);
  check(Number.isFinite(date.getTime()), 'Ungültiger Zeitpunkt.');
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
}
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && value >= '2000-01-01' && value <= '2199-12-31';
}
export function addDays(date, days) {
  check(validDate(date), 'Ungültiges Datum.');
  check(Number.isInteger(days) && Math.abs(days) <= 73000, 'Ungültiger Tagesabstand.');
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}
function weekday(date) { return new Date(`${date}T12:00:00Z`).getUTCDay(); }
function weekStart(date) { return addDays(date, -(weekday(date) + 6) % 7); }
function monthDate(anchor, offset) {
  const [year, month, day] = anchor.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1 + offset, 1, 12));
  const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0, 12)).getUTCDate();
  start.setUTCDate(Math.min(day, last));
  return start.toISOString().slice(0, 10);
}
function firstSaturday(year, month) {
  const first = new Date(Date.UTC(year, month, 1, 12));
  first.setUTCDate(1 + (6 - first.getUTCDay() + 7) % 7);
  return first.toISOString().slice(0, 10);
}
function occurrences(anchor, recurrence, from, until) {
  if (until < anchor || until < from) return [];
  const lower = from > anchor ? from : anchor;
  if (recurrence === 'once' || recurrence === 'none') return anchor >= lower && anchor <= until ? [anchor] : [];
  const result = [];
  if (['daily', 'weekdays', 'weekly'].includes(recurrence)) {
    const step = recurrence === 'weekly' ? 7 : 1;
    const elapsed = Math.floor((Date.parse(`${lower}T12:00:00Z`) - Date.parse(`${anchor}T12:00:00Z`)) / DAY);
    let cursor = addDays(anchor, Math.ceil(elapsed / step) * step);
    while (cursor <= until && result.length <= 4000) {
      if (recurrence !== 'weekdays' || ![0, 6].includes(weekday(cursor))) result.push(cursor);
      cursor = addDays(cursor, step);
    }
  } else {
    const [ay, am] = anchor.split('-').map(Number);
    const [fy, fm] = lower.split('-').map(Number);
    const step = recurrence === 'yearly' ? 12 : 1;
    const months = Math.max(0, (fy - ay) * 12 + fm - am);
    let offset = recurrence === 'yearly' ? Math.floor(months / 12) * 12 : months;
    while (result.length <= 4000) {
      let cursor = monthDate(anchor, offset);
      if (recurrence === 'firstSaturday') {
        const [year, month] = cursor.split('-').map(Number);
        cursor = firstSaturday(year, month - 1);
      }
      if (cursor > until) break;
      if (cursor >= lower && cursor >= anchor) result.push(cursor);
      offset += step;
    }
  }
  check(result.length <= 4000, 'Der Zeitraum ist zu groß.');
  return result;
}
function safeTree(value, depth = 0, counter = { n: 0 }) {
  check(++counter.n <= 100000 && depth <= 15, 'Die Datei ist zu groß oder zu tief verschachtelt.');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') { check(value.length <= 10000, 'Text ist zu lang.'); return; }
  if (typeof value === 'number') { check(Number.isFinite(value), 'Ungültige Zahl.'); return; }
  check(typeof value === 'object', 'Nur einfache JSON-Daten sind erlaubt.');
  const proto = Object.getPrototypeOf(value);
  check(Array.isArray(value) || proto === Object.prototype || proto === null, 'Nur einfache JSON-Objekte sind erlaubt.');
  if (Array.isArray(value)) check(value.length <= 12000, 'Zu viele Einträge.');
  for (const key of Reflect.ownKeys(value)) {
    check(typeof key === 'string' && !['__proto__', 'prototype', 'constructor'].includes(key), 'Unsicherer Objektschlüssel.');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    check(own(descriptor, 'value'), 'Dynamische Objekte sind nicht erlaubt.');
    if (Array.isArray(value) && key === 'length') continue;
    safeTree(descriptor.value, depth + 1, counter);
  }
}
function object(value, keys, label) {
  check(value && !Array.isArray(value) && typeof value === 'object', `${label}: Objekt erwartet.`);
  check(Object.keys(value).every(key => keys.includes(key)), `${label}: Unbekanntes Feld.`);
  check(keys.every(key => own(value, key)), `${label}: Feld fehlt.`);
}
function str(value, min, max, label) { check(typeof value === 'string' && value.length >= min && value.length <= max && (min === 0 || value.trim().length > 0), `${label}: Ungültiger Text.`); }
function int(value, min, max, label) { check(Number.isInteger(value) && value >= min && value <= max, `${label}: Ungültige Zahl.`); }
function id(value) { check(typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(value), 'Ungültige ID.'); }
function enumeration(value, values, label) { check(values.includes(value), `${label}: Ungültiger Wert.`); }
function bool(value) { check(typeof value === 'boolean', 'Wahrheitswert erwartet.'); }
function date(value) { check(validDate(value), 'Ungültiges Datum.'); }
function instant(value) { check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/.test(value) && validDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value)), 'Ungültiger Zeitpunkt.'); }
function array(value, max = 5000) { check(Array.isArray(value) && value.length <= max, 'Ungültige Liste.'); }
function unique(items) { const ids = new Set(); for (const entry of items) { id(entry.id); check(!ids.has(entry.id), 'Doppelte ID.'); ids.add(entry.id); } return ids; }
function validTaskFields(value) { str(value.title, 1, 120, 'Titel'); str(value.description, 0, 1500, 'Beschreibung'); int(value.points, 1, 500, 'Punkte'); enumeration(value.difficulty, DIFFICULTIES, 'Schwierigkeit'); date(value.dueDate); }
function validReward(value) { str(value.title, 1, 120, 'Titel'); int(value.cost, 1, 10000, 'Preis'); enumeration(value.category, CATEGORIES, 'Kategorie'); str(value.description, 0, 1500, 'Beschreibung'); bool(value.active); }
function validMember(value) {
  str(value.name, 1, 60, 'Name'); enumeration(value.role, ['parent', 'child', 'display'], 'Rolle'); check(/^#[0-9a-fA-F]{6}$/.test(value.color), 'Ungültige Farbe.');
  int(value.age, 0, 120, 'Alter'); int(value.weeklyTarget, 0, 10000, 'Wochenziel'); array(value.allowedDifficulties, 3);
  check(new Set(value.allowedDifficulties).size === value.allowedDifficulties.length, 'Doppelte Schwierigkeit.'); value.allowedDifficulties.forEach(d => enumeration(d, DIFFICULTIES, 'Schwierigkeit'));
  if (value.role === 'child') check(value.allowedDifficulties.length > 0, 'Mindestens eine passende Schwierigkeit ist nötig.');
}
function validEvent(value, memberIds) {
  str(value.title, 1, 120, 'Titel'); date(value.date); bool(value.allDay);
  for (const time of [value.start, value.end]) check(typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time), 'Ungültige Uhrzeit.');
  check(value.allDay || value.start < value.end, 'Das Ende muss nach dem Beginn liegen.'); array(value.members, 100); check(new Set(value.members).size === value.members.length && value.members.every(mid => memberIds.has(mid)), 'Unbekanntes Mitglied.');
  enumeration(value.recurrence, ['none', 'weekly', 'monthly', 'yearly'], 'Wiederholung'); str(value.location, 0, 200, 'Ort'); int(value.reminder, 0, 10080, 'Erinnerung');
}
/** Validate and copy untrusted plain data. Throws on incompatible or unsafe imports. */
export function validateState(raw) {
  safeTree(raw);
  object(raw, ['schema', 'family', 'members', 'taskSeries', 'tasks', 'events', 'rewards', 'redemptions', 'ledger', 'shoppingLists'], 'Familiendaten');
  check(raw.schema === 1, 'Diese Dateiversion wird nicht unterstützt.');
  object(raw.family, ['name', 'timezone', 'weeklyBonus'], 'Familie'); str(raw.family.name, 1, 80, 'Familienname'); check(raw.family.timezone === 'Europe/Berlin', 'Die Demo verwendet Europe/Berlin.'); int(raw.family.weeklyBonus, 1, 1000, 'Wochenbonus');
  for (const key of ['members', 'taskSeries', 'tasks', 'events', 'rewards', 'redemptions', 'ledger', 'shoppingLists']) array(raw[key], key === 'members' ? 100 : key === 'shoppingLists' ? 100 : 10000);
  const memberIds = unique(raw.members), seriesIds = unique(raw.taskSeries), taskIds = unique(raw.tasks), eventIds = unique(raw.events), rewardIds = unique(raw.rewards);
  unique(raw.redemptions); unique(raw.ledger); unique(raw.shoppingLists);
  check(raw.members.some(member => member.role === 'parent'), 'Mindestens ein Elternprofil ist nötig.');
  raw.members.forEach(value => { object(value, ['id', 'name', 'role', 'color', 'age', 'weeklyTarget', 'allowedDifficulties'], 'Mitglied'); validMember(value); });
  raw.taskSeries.forEach(value => { object(value, ['id', 'title', 'description', 'points', 'difficulty', 'recurrence', 'dueDate', 'paused', 'active'], 'Aufgabenserie'); validTaskFields(value); enumeration(value.recurrence, RECURRENCES, 'Wiederholung'); bool(value.paused); bool(value.active); });
  const occurrenceKeys = new Set();
  raw.tasks.forEach(value => {
    object(value, ['id', 'seriesId', 'title', 'description', 'points', 'difficulty', 'dueDate', 'status', 'assigneeId', 'approvedAt'], 'Aufgabe'); validTaskFields(value); check(seriesIds.has(value.seriesId), 'Unbekannte Aufgabenserie.'); enumeration(value.status, ['open', 'claimed', 'submitted', 'approved'], 'Aufgabenstatus');
    check(value.assigneeId === null || raw.members.some(member => member.id === value.assigneeId && member.role !== 'display'), 'Unbekannte Aufgabenperson.');
    const occurrenceKey = `${value.seriesId}:${value.dueDate}`; check(!occurrenceKeys.has(occurrenceKey), 'Doppelte Aufgaben-Instanz.'); occurrenceKeys.add(occurrenceKey);
    check(value.status === 'open' ? value.assigneeId === null : value.assigneeId !== null, 'Aufgabe und Zuordnung passen nicht zusammen.');
    if (value.status === 'approved') instant(value.approvedAt); else check(value.approvedAt === null, 'Unbestätigte Aufgabe mit Buchungsdatum.');
  });
  raw.events.forEach(value => { object(value, ['id', 'title', 'date', 'start', 'end', 'allDay', 'members', 'recurrence', 'location', 'reminder'], 'Termin'); validEvent(value, memberIds); });
  raw.rewards.forEach(value => { object(value, ['id', 'title', 'cost', 'category', 'description', 'active'], 'Belohnung'); validReward(value); });
  raw.redemptions.forEach(value => {
    object(value, ['id', 'rewardId', 'title', 'cost', 'memberId', 'status', 'createdAt'], 'Belohnungswunsch'); check(rewardIds.has(value.rewardId) && raw.members.some(member => member.id === value.memberId && member.role === 'child'), 'Unbekannte Belohnung oder Person.'); str(value.title, 1, 120, 'Titel'); int(value.cost, 1, 10000, 'Preis'); enumeration(value.status, ['pending', 'approved', 'rejected'], 'Wunschstatus'); instant(value.createdAt);
  });
  const sourceKeys = new Set();
  raw.ledger.forEach(value => {
    object(value, ['id', 'memberId', 'amount', 'reason', 'sourceKey', 'createdAt'], 'Punktebuchung'); check(memberIds.has(value.memberId), 'Unbekanntes Punktekonto.'); int(value.amount, -100000, 100000, 'Buchung'); check(value.amount !== 0, 'Leere Punktebuchung.'); str(value.reason, 1, 240, 'Buchungsgrund'); str(value.sourceKey, 1, 180, 'Buchungsreferenz'); instant(value.createdAt); check(!sourceKeys.has(value.sourceKey), 'Doppelte Punktebuchung.'); sourceKeys.add(value.sourceKey);
  });
  for (const task of raw.tasks) if (task.status === 'approved') {
    const entries = raw.ledger.filter(entry => entry.sourceKey === `task:${task.id}`);
    check(entries.length === 1 && entries[0].memberId === task.assigneeId && entries[0].amount === task.points, 'Bestätigte Aufgabe und Punktejournal passen nicht zusammen.');
  }
  for (const entry of raw.ledger) if (entry.sourceKey.startsWith('task:')) check(taskIds.has(entry.sourceKey.slice(5)) && raw.tasks.some(task => task.id === entry.sourceKey.slice(5) && task.status === 'approved'), 'Aufgabenbuchung ohne bestätigte Aufgabe.');
  for (const redemption of raw.redemptions) {
    const debit = raw.ledger.find(entry => entry.sourceKey === `redemption:${redemption.id}`);
    const refund = raw.ledger.find(entry => entry.sourceKey === `refund:${redemption.id}`);
    check(debit && debit.memberId === redemption.memberId && debit.amount === -redemption.cost, 'Wunsch und Reservierung passen nicht zusammen.');
    check(redemption.status === 'rejected' ? refund && refund.memberId === redemption.memberId && refund.amount === redemption.cost : !refund, 'Wunsch und Erstattung passen nicht zusammen.');
  }
  for (const list of raw.shoppingLists) {
    object(list, ['id', 'name', 'items'], 'Einkaufsliste'); str(list.name, 1, 80, 'Listenname'); array(list.items, 500); unique(list.items);
    for (const item of list.items) { object(item, ['id', 'name', 'quantity', 'category', 'checked'], 'Einkauf'); str(item.name, 1, 120, 'Artikel'); str(item.quantity, 0, 60, 'Menge'); str(item.category, 0, 60, 'Kategorie'); bool(item.checked); }
  }
  return clone(raw);
}
export function importState(raw) {
  if (typeof raw === 'string') { check(raw.length <= 1048576, 'Die Datei darf höchstens 1 MB groß sein.'); try { raw = JSON.parse(raw); } catch { fail('Die Datei enthält kein gültiges JSON.'); } }
  return validateState(raw);
}
export function balance(state, memberId) { return state.ledger.filter(entry => entry.memberId === memberId).reduce((sum, entry) => sum + entry.amount, 0); }
export function getFairness(state, now = new Date()) {
  const start = weekStart(today(now)), end = addDays(start, 6);
  return state.members.filter(member => member.role === 'child').map(member => {
    const approved = state.tasks.filter(task => task.status === 'approved' && task.assigneeId === member.id && today(task.approvedAt) >= start && today(task.approvedAt) <= end);
    const counts = Object.fromEntries(DIFFICULTIES.map(difficulty => [difficulty, approved.filter(task => task.difficulty === difficulty).length]));
    const needed = member.allowedDifficulties.filter(difficulty => !counts[difficulty]);
    const effort = approved.reduce((sum, task) => sum + task.points, 0);
    return { memberId: member.id, completed: approved.length, effort, counts, eligible: needed.length === 0, bonusAwarded: state.ledger.some(entry => entry.sourceKey === `bonus:${start}:${member.id}`), needed, target: member.weeklyTarget, progress: member.weeklyTarget ? Math.min(100, Math.round(effort / member.weeklyTarget * 100)) : 0 };
  });
}
export function getEvents(state, fromDate, untilDate) {
  date(fromDate); date(untilDate); check(fromDate <= untilDate, 'Ungültiger Zeitraum.');
  check(Date.parse(untilDate) - Date.parse(fromDate) <= DAY * 366 * 5, 'Bitte höchstens fünf Jahre anzeigen.');
  return state.events.flatMap(event => occurrences(event.date, event.recurrence, fromDate, untilDate).map(occurrenceDate => ({ ...clone(event), date: occurrenceDate, occurrenceDate }))).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}
function newId(state, prefix) {
  const all = new Set([...state.members, ...state.tasks, ...state.taskSeries, ...state.events, ...state.rewards, ...state.redemptions, ...state.ledger, ...state.shoppingLists, ...state.shoppingLists.flatMap(list => list.items)].map(item => item.id));
  let candidate;
  do { candidate = `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`; } while (all.has(candidate));
  return candidate;
}
function firstOccurrence(series) { return occurrences(series.dueDate, series.recurrence, series.dueDate, addDays(series.dueDate, 40))[0]; }
function taskFromSeries(series, dueDate, idValue) { return { id: idValue, seriesId: series.id, title: series.title, description: series.description, points: series.points, difficulty: series.difficulty, dueDate, status: 'open', assigneeId: null, approvedAt: null }; }
function fillOccurrences(state, now) {
  const until = addDays(today(now), 7);
  for (const series of state.taskSeries) {
    if (!series.active || series.paused) continue;
    // Limit the initial catch-up to a year; imported history remains untouched.
    const lower = series.dueDate > addDays(until, -366) ? series.dueDate : addDays(until, -366);
    const dates = occurrences(series.dueDate, series.recurrence, lower, until);
    for (const due of dates) {
      if (state.tasks.some(task => task.seriesId === series.id && task.dueDate === due)) continue;
      const naturalId = `${series.id}_${due}`;
      const occurrenceId = state.tasks.some(task => task.id === naturalId) ? newId(state, 'task') : naturalId;
      state.tasks.push(taskFromSeries(series, due, occurrenceId));
    }
  }
  check(state.tasks.length <= 10000, 'Zu viele Aufgaben. Bitte eine ältere Serie archivieren.');
  return state;
}
export function materialize(state, now = new Date()) { const result = validateState(state); return validateState(fillOccurrences(result, now)); }
function getItem(items, idValue, label) { const item = items.find(value => value.id === idValue); check(item, `${label} wurde nicht gefunden.`); return item; }
function parent(actor) { check(actor.role === 'parent', 'Diese Aktion ist nur für Elternprofile verfügbar.'); }
function appendLedger(state, memberId, amount, reason, sourceKey, now) {
  if (state.ledger.some(entry => entry.sourceKey === sourceKey)) return;
  state.ledger.push({ id: newId(state, 'entry'), memberId, amount, reason, sourceKey, createdAt: new Date(now).toISOString() });
}
function pick(payload, keys) { const value = {}; for (const key of keys) if (own(payload, key)) value[key] = payload[key]; return value; }
const taskKeys = ['title', 'description', 'points', 'difficulty', 'recurrence', 'dueDate'];
const memberKeys = ['name', 'role', 'color', 'age', 'weeklyTarget', 'allowedDifficulties'];
const eventKeys = ['title', 'date', 'start', 'end', 'allDay', 'members', 'recurrence', 'location', 'reminder'];
/** Apply one simulated role action to a fresh state. No network or persistent I/O. */
export function reduce(state, actorId, action, payload = {}, now = new Date()) {
  const result = validateState(state);
  safeTree(payload); check(payload && typeof payload === 'object' && !Array.isArray(payload), 'Ungültige Aktion.');
  const actor = getItem(result.members, actorId, 'Profil'); check(actor.role !== 'display', 'Das Küchen-Display ist schreibgeschützt.');
  const stamp = new Date(now).toISOString();
  switch (action) {
    case 'task.create': {
      parent(actor);
      const series = { id: newId(result, 'series'), title: '', description: '', points: 5, difficulty: 'easy', recurrence: 'once', dueDate: today(now), paused: false, active: true, ...pick(payload, taskKeys) };
      validTaskFields(series); enumeration(series.recurrence, RECURRENCES, 'Wiederholung'); result.taskSeries.push(series);
      const firstDate = firstOccurrence(series);
      result.tasks.push(taskFromSeries(series, firstDate, `${series.id}_${firstDate}`));
      break;
    }
    case 'task.edit': {
      parent(actor); const task = getItem(result.tasks, payload.id, 'Aufgabe'); const series = getItem(result.taskSeries, task.seriesId, 'Serie');
      const reschedule = (own(payload, 'dueDate') && payload.dueDate !== series.dueDate) || (own(payload, 'recurrence') && payload.recurrence !== series.recurrence);
      Object.assign(series, pick(payload, taskKeys)); validTaskFields(series); enumeration(series.recurrence, RECURRENCES, 'Wiederholung');
      if (reschedule) {
        result.tasks = result.tasks.filter(occurrence => occurrence.seriesId !== series.id || occurrence.status !== 'open');
        const firstDate = firstOccurrence(series);
        if (series.active && !result.tasks.some(occurrence => occurrence.seriesId === series.id && occurrence.dueDate === firstDate)) {
          const naturalId = `${series.id}_${firstDate}`;
          const occurrenceId = result.tasks.some(item => item.id === naturalId) ? newId(result, 'task') : naturalId;
          result.tasks.push(taskFromSeries(series, firstDate, occurrenceId));
        }
        fillOccurrences(result, now);
      }
      for (const occurrence of result.tasks.filter(item => item.seriesId === series.id && item.status === 'open')) Object.assign(occurrence, pick(series, ['title', 'description', 'points', 'difficulty']));
      break;
    }
    case 'task.claim': {
      const task = getItem(result.tasks, payload.id, 'Aufgabe');
      if (task.status === 'claimed' && task.assigneeId === actor.id) break;
      check(task.status === 'open', 'Diese Aufgabe ist bereits vergeben.');
      const series = getItem(result.taskSeries, task.seriesId, 'Serie'); check(series.active && !series.paused, 'Diese Serie ist pausiert oder archiviert.');
      check(actor.role !== 'child' || actor.allowedDifficulties.includes(task.difficulty), 'Diese Schwierigkeit ist für dein Profil noch nicht freigegeben.');
      task.status = 'claimed'; task.assigneeId = actor.id; break;
    }
    case 'task.submit': {
      const task = getItem(result.tasks, payload.id, 'Aufgabe'); check(task.assigneeId === actor.id || actor.role === 'parent', 'Du kannst nur deine eigenen Aufgaben einreichen.');
      if (task.status === 'submitted' || task.status === 'approved') break;
      check(task.status === 'claimed', 'Bitte zuerst die Aufgabe übernehmen.'); task.status = 'submitted'; break;
    }
    case 'task.approve': {
      parent(actor); const task = getItem(result.tasks, payload.id, 'Aufgabe'); if (task.status === 'approved') break;
      check(task.status === 'submitted' && task.assigneeId, 'Die Aufgabe wurde noch nicht eingereicht.');
      task.status = 'approved'; task.approvedAt = stamp; appendLedger(result, task.assigneeId, task.points, `Aufgabe: ${task.title}`, `task:${task.id}`, now); break;
    }
    case 'task.reject': {
      parent(actor); const task = getItem(result.tasks, payload.id, 'Aufgabe'); if (task.status === 'claimed') break; check(task.status === 'submitted', 'Nur eingereichte Aufgaben können zurückgegeben werden.'); task.status = 'claimed'; break;
    }
    case 'task.release': {
      const task = getItem(result.tasks, payload.id, 'Aufgabe'); check(actor.role === 'parent' || task.assigneeId === actor.id, 'Du kannst nur deine eigenen Aufgaben freigeben.'); check(task.status !== 'approved', 'Bestätigte Aufgaben bleiben im Verlauf.');
      if (!getItem(result.taskSeries, task.seriesId, 'Serie').active) result.tasks = result.tasks.filter(item => item.id !== task.id);
      else { task.status = 'open'; task.assigneeId = null; }
      break;
    }
    case 'series.pause': { parent(actor); const series = getItem(result.taskSeries, payload.id, 'Serie'); check(series.active, 'Diese Serie ist archiviert.'); series.paused = !series.paused; break; }
    case 'series.archive': { parent(actor); const series = getItem(result.taskSeries, payload.id, 'Serie'); series.active = false; result.tasks = result.tasks.filter(task => task.seriesId !== series.id || task.status !== 'open'); break; }
    case 'reward.create': {
      parent(actor); const reward = { id: newId(result, 'reward'), title: '', cost: 20, category: 'experience', description: '', active: true, ...pick(payload, ['title', 'cost', 'category', 'description']) }; validReward(reward); result.rewards.push(reward); break;
    }
    case 'reward.edit': { parent(actor); const reward = getItem(result.rewards, payload.id, 'Belohnung'); Object.assign(reward, pick(payload, ['title', 'cost', 'category', 'description'])); validReward(reward); break; }
    case 'reward.archive': { parent(actor); getItem(result.rewards, payload.id, 'Belohnung').active = false; break; }
    case 'reward.request': {
      check(actor.role === 'child', 'Belohnungswünsche sind für Kinderprofile verfügbar.'); const reward = getItem(result.rewards, payload.id, 'Belohnung'); check(reward.active, 'Diese Belohnung ist archiviert.'); check(balance(result, actor.id) >= reward.cost, 'Dafür fehlen noch Punkte.');
      const redemption = { id: newId(result, 'wish'), rewardId: reward.id, title: reward.title, cost: reward.cost, memberId: actor.id, status: 'pending', createdAt: stamp }; result.redemptions.push(redemption); appendLedger(result, actor.id, -reward.cost, `Reserviert: ${reward.title}`, `redemption:${redemption.id}`, now); break;
    }
    case 'redemption.approve': {
      parent(actor); const wish = getItem(result.redemptions, payload.id, 'Wunsch'); if (wish.status === 'approved') break; check(wish.status === 'pending', 'Dieser Wunsch wurde bereits entschieden.'); wish.status = 'approved'; break;
    }
    case 'redemption.reject': {
      parent(actor); const wish = getItem(result.redemptions, payload.id, 'Wunsch'); if (wish.status === 'rejected') break; check(wish.status === 'pending', 'Dieser Wunsch wurde bereits entschieden.'); wish.status = 'rejected'; appendLedger(result, wish.memberId, wish.cost, `Erstattet: ${wish.title}`, `refund:${wish.id}`, now); break;
    }
    case 'points.adjust': {
      parent(actor); const member = getItem(result.members, payload.memberId, 'Mitglied'); check(member.role === 'child', 'Punkte sind für Kinderprofile vorgesehen.'); int(payload.amount, -10000, 10000, 'Punkte'); check(payload.amount !== 0, 'Bitte eine Änderung ungleich null eingeben.'); str(payload.reason, 1, 200, 'Begründung'); appendLedger(result, member.id, payload.amount, payload.reason, `manual:${newId(result, 'adjust')}`, now); break;
    }
    case 'bonus.claim': {
      const memberId = payload.memberId || actor.id; check(actor.role === 'parent' || actor.id === memberId, 'Du kannst nur deinen eigenen Wochenbonus abholen.'); const fairness = getFairness(result, now).find(item => item.memberId === memberId); check(fairness, 'Wochenbonus ist für Kinderprofile verfügbar.'); if (fairness.bonusAwarded) break; check(fairness.eligible, 'Für den Wochenbonus fehlt noch eine passende Schwierigkeit.'); appendLedger(result, memberId, result.family.weeklyBonus, 'Wochenbonus: vielseitig geholfen', `bonus:${weekStart(today(now))}:${memberId}`, now); break;
    }
    case 'event.create': { parent(actor); const event = { id: newId(result, 'event'), title: '', date: today(now), start: '16:00', end: '17:00', allDay: false, members: [], recurrence: 'none', location: '', reminder: 15, ...pick(payload, eventKeys) }; validEvent(event, new Set(result.members.map(member => member.id))); result.events.push(event); break; }
    case 'event.edit': { parent(actor); const event = getItem(result.events, payload.id, 'Termin'); Object.assign(event, pick(payload, eventKeys)); validEvent(event, new Set(result.members.map(member => member.id))); break; }
    case 'event.delete': { parent(actor); getItem(result.events, payload.id, 'Termin'); result.events = result.events.filter(event => event.id !== payload.id); break; }
    case 'shopping.list.create': { str(payload.name, 1, 80, 'Listenname'); result.shoppingLists.push({ id: newId(result, 'list'), name: payload.name, items: [] }); break; }
    case 'shopping.list.delete': { parent(actor); getItem(result.shoppingLists, payload.id, 'Liste'); result.shoppingLists = result.shoppingLists.filter(list => list.id !== payload.id); break; }
    case 'shopping.item.add': {
      const list = getItem(result.shoppingLists, payload.listId, 'Liste'); str(payload.name, 1, 120, 'Artikel'); const quantity = payload.quantity ?? '', category = payload.category ?? ''; str(quantity, 0, 60, 'Menge'); str(category, 0, 60, 'Kategorie'); list.items.push({ id: newId(result, 'item'), name: payload.name, quantity, category, checked: false }); break;
    }
    case 'shopping.item.toggle': { const list = getItem(result.shoppingLists, payload.listId, 'Liste'); const item = getItem(list.items, payload.id, 'Artikel'); item.checked = !item.checked; break; }
    case 'shopping.item.delete': { const list = getItem(result.shoppingLists, payload.listId, 'Liste'); getItem(list.items, payload.id, 'Artikel'); list.items = list.items.filter(item => item.id !== payload.id); break; }
    case 'shopping.item.edit': { const list = getItem(result.shoppingLists, payload.listId, 'Liste'); const item = getItem(list.items, payload.id, 'Artikel'); Object.assign(item, pick(payload, ['name', 'quantity', 'category', 'checked'])); break; }
    case 'member.add': {
      parent(actor); const member = { id: newId(result, 'member'), name: '', role: 'child', color: '#64748b', age: 10, weeklyTarget: 40, allowedDifficulties: ['easy', 'medium'], ...pick(payload, memberKeys) }; validMember(member); result.members.push(member); break;
    }
    case 'member.edit': { parent(actor); const member = getItem(result.members, payload.id, 'Mitglied'); Object.assign(member, pick(payload, memberKeys)); validMember(member); break; }
    case 'member.remove': {
      parent(actor); const member = getItem(result.members, payload.id, 'Mitglied');
      check(!result.ledger.some(entry => entry.memberId === member.id) && !result.tasks.some(task => task.assigneeId === member.id) && !result.redemptions.some(wish => wish.memberId === member.id), 'Dieses Profil hat bereits einen Verlauf und kann nicht gelöscht werden.');
      result.members = result.members.filter(item => item.id !== member.id); for (const event of result.events) event.members = event.members.filter(mid => mid !== member.id); break;
    }
    case 'family.edit': { parent(actor); Object.assign(result.family, pick(payload, ['name', 'timezone', 'weeklyBonus'])); break; }
    default: fail('Unbekannte Aktion.');
  }
  return validateState(result);
}

export function seedState(now = new Date()) {
  const day = today(now), monday = weekStart(day), instantFor = dateValue => `${dateValue}T11:00:00.000Z`;
  const state = {
    schema: 1, family: { name: 'Familie Sommer', timezone: 'Europe/Berlin', weeklyBonus: 15 },
    members: [
      { id: 'anna', name: 'Anna', role: 'parent', color: '#0d9488', age: 39, weeklyTarget: 0, allowedDifficulties: DIFFICULTIES.slice() },
      { id: 'tom', name: 'Tom', role: 'parent', color: '#3b82f6', age: 41, weeklyTarget: 0, allowedDifficulties: DIFFICULTIES.slice() },
      { id: 'lina', name: 'Lina', role: 'child', color: '#8b5cf6', age: 12, weeklyTarget: 60, allowedDifficulties: DIFFICULTIES.slice() },
      { id: 'ben', name: 'Ben', role: 'child', color: '#f59e0b', age: 9, weeklyTarget: 35, allowedDifficulties: ['easy', 'medium'] },
      { id: 'kitchen', name: 'Küchen-Display', role: 'display', color: '#64748b', age: 0, weeklyTarget: 0, allowedDifficulties: [] }
    ], taskSeries: [], tasks: [], events: [], rewards: [
      { id: 'reward_ice', title: 'Eis für dich & eine Begleitung', cost: 30, category: 'experience', description: 'Gemeinsam zur Lieblingseisdiele gehen.', active: true },
      { id: 'reward_money', title: '5 € Taschengeld extra', cost: 60, category: 'money', description: 'Für deinen nächsten kleinen Wunsch.', active: true },
      { id: 'reward_screen', title: '30 Minuten Spielzeit', cost: 25, category: 'screen', description: 'Zusätzliche Bildschirmzeit nach Absprache.', active: true },
      { id: 'reward_family', title: 'Du bestimmst den Familienabend', cost: 45, category: 'together', description: 'Film, Spiel und Lieblingsessen auswählen.', active: true }
    ], redemptions: [], ledger: [], shoppingLists: [
      { id: 'list_week', name: 'Wocheneinkauf', items: [
        { id: 'item_apples', name: 'Äpfel', quantity: '1 kg', category: 'Obst & Gemüse', checked: false },
        { id: 'item_milk', name: 'Hafermilch', quantity: '2 Packungen', category: 'Kühlregal', checked: false },
        { id: 'item_bread', name: 'Vollkornbrot', quantity: '1 Laib', category: 'Bäckerei', checked: true },
        { id: 'item_pasta', name: 'Nudeln', quantity: '500 g', category: 'Vorrat', checked: false }
      ] },
      { id: 'list_weekend', name: 'Fürs Wochenende', items: [
        { id: 'item_popcorn', name: 'Popcornmais', quantity: '1 Tüte', category: 'Vorrat', checked: false },
        { id: 'item_cocoa', name: 'Kakao', quantity: '1 Packung', category: 'Getränke', checked: false }
      ] }
    ]
  };
  function seedTask(key, title, points, difficulty, dueDate, status = 'open', assigneeId = null, recurrence = 'once') {
    const series = { id: `series_${key}`, title, description: ({ table: 'Nach dem Abendessen Teller und Besteck wegräumen.', plants: 'Auch die große Pflanze im Wohnzimmer braucht Wasser.', recycling: 'Papier und Verpackungen getrennt nach unten bringen.', room: 'Bücher, Kleidung und Spielsachen an ihren Platz räumen.', laundry: 'Frische Wäsche sortieren und zusammenlegen.', pet: 'Frisches Wasser und eine Portion Futter bereitstellen.', breakfast: 'Teller, Gläser und Besteck für alle vorbereiten.' })[key] || 'Gemeinsam wird der Alltag leichter.', points, difficulty, recurrence, dueDate, paused: false, active: true };
    const task = taskFromSeries(series, dueDate, `task_${key}`); task.status = status; task.assigneeId = assigneeId; task.approvedAt = status === 'approved' ? instantFor(dueDate) : null; state.taskSeries.push(series); state.tasks.push(task);
    if (status === 'approved') state.ledger.push({ id: `entry_${key}`, memberId: assigneeId, amount: points, reason: `Aufgabe: ${title}`, sourceKey: `task:${task.id}`, createdAt: task.approvedAt });
  }
  seedTask('table', 'Tisch abräumen', 10, 'easy', day, 'open', null, 'daily');
  seedTask('plants', 'Pflanzen gießen', 15, 'medium', day, 'claimed', 'ben', 'weekly');
  seedTask('recycling', 'Recycling wegbringen', 15, 'medium', day, 'submitted', 'lina', 'weekly');
  seedTask('room', 'Zimmer gründlich aufräumen', 25, 'hard', addDays(day, 1));
  seedTask('laundry', 'Wäsche zusammenlegen', 20, 'hard', monday, 'approved', 'lina');
  seedTask('pet', 'Milo füttern', 5, 'easy', monday, 'approved', 'ben');
  seedTask('breakfast', 'Frühstückstisch decken', 10, 'easy', monday, 'approved', 'lina');
  state.ledger.unshift({ id: 'entry_start_lina', memberId: 'lina', amount: 45, reason: 'Demostart: bereits gesammelte Punkte', sourceKey: 'seed:lina', createdAt: instantFor(addDays(monday, -7)) }, { id: 'entry_start_ben', memberId: 'ben', amount: 25, reason: 'Demostart: bereits gesammelte Punkte', sourceKey: 'seed:ben', createdAt: instantFor(addDays(monday, -7)) });
  state.events = [
    { id: 'event_dinner', title: 'Gemeinsam kochen', date: day, start: '18:00', end: '19:00', allDay: false, members: ['anna', 'tom', 'lina', 'ben'], recurrence: 'weekly', location: 'Zuhause', reminder: 30 },
    { id: 'event_soccer', title: 'Bens Fußballtraining', date: addDays(day, 1), start: '16:00', end: '17:30', allDay: false, members: ['ben', 'tom'], recurrence: 'weekly', location: 'Sportplatz am Park', reminder: 30 },
    { id: 'event_music', title: 'Linas Gitarrenstunde', date: addDays(day, 2), start: '15:30', end: '16:15', allDay: false, members: ['lina'], recurrence: 'weekly', location: 'Musikschule', reminder: 15 },
    { id: 'event_dentist', title: 'Zahnarzt: Vorsorge', date: addDays(day, 3), start: '09:00', end: '10:00', allDay: false, members: ['anna', 'ben', 'lina'], recurrence: 'none', location: 'Praxis am Markt', reminder: 60 },
    { id: 'event_library', title: 'Bücher zurückbringen', date: addDays(day, 4), start: '16:00', end: '16:45', allDay: false, members: ['anna', 'ben'], recurrence: 'none', location: 'Stadtbibliothek', reminder: 30 },
    { id: 'event_games', title: 'Spieleabend', date: addDays(day, 5), start: '19:00', end: '20:30', allDay: false, members: ['anna', 'tom', 'lina', 'ben'], recurrence: 'monthly', location: 'Wohnzimmer', reminder: 15 },
    { id: 'event_outing', title: 'Familienausflug ins Grüne', date: addDays(day, 7), start: '10:00', end: '16:00', allDay: true, members: ['anna', 'tom', 'lina', 'ben'], recurrence: 'none', location: 'Wald & Wiesen', reminder: 60 },
    { id: 'event_council', title: 'Familienrat & Wunschessen', date: addDays(day, 10), start: '18:00', end: '19:00', allDay: false, members: ['anna', 'tom', 'lina', 'ben'], recurrence: 'monthly', location: 'Küchentisch', reminder: 30 }
  ];
  return validateState(state);
}
