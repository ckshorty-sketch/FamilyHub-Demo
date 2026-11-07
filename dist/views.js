import { h, icon, fmtDate, fmtTime, nameOf, avatar } from './ui.js';
import { balance, getFairness, getEvents, today, addDays } from './model.js';

const DIFFICULTIES = { easy: 'Leicht', medium: 'Mittel', hard: 'Knifflig' };
const STATUSES = { open: 'Offen', claimed: 'Übernommen', submitted: 'Zur Freigabe', approved: 'Erledigt' };
const CATEGORIES = { experience: 'Erlebnis', money: 'Taschengeld', screen: 'Medienzeit', together: 'Gemeinsame Zeit' };
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const ROLE_NAMES = { parent: 'Elternteil', child: 'Kind', display: 'Küchenanzeige' };
const number = (value) => new Intl.NumberFormat('de-DE').format(Number(value) || 0);
const currentDate = (now) => today(now || new Date());
const dateObject = (date) => new Date(`${String(date).slice(0, 10)}T12:00:00Z`);
const dateString = (date) => date.toISOString().slice(0, 10);
const dateLabel = (date, options = { day: 'numeric', month: 'long' }) => new Intl.DateTimeFormat('de-DE', { ...options, timeZone: 'UTC' }).format(dateObject(date));
const member = (state, id) => state.members.find(item => item.id === id);
const memberName = (state, id) => id ? (nameOf(state, id) || member(state, id)?.name || 'Familienmitglied') : 'Noch nicht übernommen';
const children = (state) => state.members.filter(item => item.role === 'child');
const parent = (actor) => actor?.role === 'parent';
const child = (actor) => actor?.role === 'child';
const writable = (actor) => parent(actor) || child(actor);
const seriesFor = (state, task) => state.taskSeries.find(item => item.id === task.seriesId);
const isActiveTask = (state, task) => task.status !== 'open' || !task.seriesId || seriesFor(state, task)?.active !== false;
const tasksFor = (state) => state.tasks.filter(task => isActiveTask(state, task));
const dueOrder = (a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'));
const difficultyLabel = (difficulty) => DIFFICULTIES[difficulty] || difficulty || 'Leicht';
const allowedTask = (actor, task) => child(actor) && (actor.allowedDifficulties || ['easy', 'medium', 'hard']).includes(task.difficulty);
const shortDate = (date, now) => !date ? 'Ohne Termin' : date === currentDate(now) ? 'Heute' : date === addDays(currentDate(now), 1) ? 'Morgen' : fmtDate(date);
const recurrenceLabel = (recurrence) => ({ none: '', once: '', daily: 'Täglich', weekly: 'Wöchentlich', weekdays: 'Mo–Fr', monthly: 'Monatlich', firstSaturday: 'Jeden 1. Samstag', yearly: 'Jährlich' }[recurrence] ?? (recurrence ? 'Wiederholend' : ''));
const eventDate = (event) => event.occurrenceDate || event.date;
const eventTime = (event) => event.allDay ? 'Ganztägig' : `${fmtTime(event.start || '00:00')}${event.end ? ` – ${fmtTime(event.end)}` : ''}`;
const empty = (symbol, title, copy, action = '') => `<div class="empty">${icon(symbol)}<h3>${h(title)}</h3><p>${h(copy)}</p>${action}</div>`;

function button(label, action, extra = '', variant = 'secondary', symbol = '') {
  return `<button type="button" class="button ${h(variant)}" data-action="${h(action)}" ${extra}>${symbol ? icon(symbol) : ''}<span>${h(label)}</span></button>`;
}

function iconButton(label, action, extra = '', symbol = 'edit') {
  return `<button type="button" class="icon-button" data-action="${h(action)}" ${extra} aria-label="${h(label)}" title="${h(label)}">${icon(symbol)}</button>`;
}

function heading(kicker, title, description, actions = '') {
  return `<header class="page-heading"><div><p class="eyebrow">${h(kicker)}</p><h1 class="page-title">${h(title)}</h1><p class="subtitle">${h(description)}</p></div>${actions ? `<div class="heading-actions">${actions}</div>` : ''}</header>`;
}

function progress(value, label = '') {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  return `<div class="progress" role="progressbar" aria-label="${h(label || 'Fortschritt')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${h(safe)}"><span class="progress-fill" style="width:${h(safe)}%"></span></div>`;
}

function points(value, label = 'Punkte') {
  return `<span class="points">${icon('coin')}<strong>${h(number(value))}</strong><span>${h(label)}</span></span>`;
}

function taskControls(state, actor, task) {
  const mine = task.assigneeId === actor?.id;
  const series = seriesFor(state, task);
  const id = `data-id="${h(task.id)}"`;
  if (parent(actor)) {
    if (series?.active === false && task.status === 'approved') return '';
    const approval = task.status === 'submitted'
      ? `${button('Freigeben', 'task-action', `${id} data-op="approve"`, 'primary small', 'check')}${button('Zurückgeben', 'task-action', `${id} data-op="reject"`, 'ghost small', 'refresh')}`
      : '';
    const release = ['claimed', 'submitted'].includes(task.status)
      ? button(series?.active === false ? 'Ohne Punkte entfernen' : 'Zurücklegen', 'task-action', `${id} data-op="release"`, 'ghost small', series?.active === false ? 'trash' : 'refresh')
      : '';
    return `<div class="task-actions">${approval}${release}${series?.active !== false ? iconButton(`${task.title} bearbeiten`, 'open-task', id) : ''}${series && series.active !== false && !['none', 'once'].includes(series.recurrence) ? iconButton(series.paused ? 'Wiederholung fortsetzen' : 'Wiederholung pausieren', 'series-pause', `data-id="${h(series.id)}"`, series.paused ? 'play' : 'pause') : ''}${series && series.active !== false ? iconButton('Aufgabenserie archivieren', 'series-archive', `data-id="${h(series.id)}"`, 'trash') : ''}</div>`;
  }
  if (!child(actor)) return '';
  if (task.status === 'open') {
    if (series?.paused) return '<span class="muted task-hint">Wiederholung pausiert</span>';
    if (!allowedTask(actor, task)) return '<span class="muted task-hint">Für diese Stufe noch nicht freigeschaltet</span>';
    return `<div class="task-actions">${button('Ich übernehme das', 'task-action', `${id} data-op="claim"`, 'primary small', 'plus')}</div>`;
  }
  if (task.status === 'claimed' && mine) {
    return `<div class="task-actions">${button('Fertig melden', 'task-action', `${id} data-op="submit"`, 'primary small', 'check')}${button(series?.active === false ? 'Ohne Punkte entfernen' : 'Zurücklegen', 'task-action', `${id} data-op="release"`, 'ghost small')}</div>`;
  }
  if (task.status === 'submitted' && mine) return `<span class="task-hint">${icon('clock')} Wartet auf die Freigabe</span>`;
  if (task.status === 'approved' && mine) return `<span class="task-hint success-text">${icon('checkCircle')} ${h(number(task.points))} Punkte gutgeschrieben</span>`;
  return '';
}

function taskCard(state, actor, task, now, compact = false) {
  const owner = task.assigneeId ? member(state, task.assigneeId) : null;
  const series = seriesFor(state, task);
  const overdue = task.dueDate && task.dueDate < currentDate(now) && !['approved', 'submitted'].includes(task.status);
  return `<article class="${compact ? 'task-row' : 'task-card'} ${task.status === 'approved' ? 'task-done' : ''}">
    <div class="task-main"><div class="task-topline"><span class="badge ${h(task.difficulty)}">${h(difficultyLabel(task.difficulty))}</span><span class="badge status ${h(task.status)}">${h(STATUSES[task.status] || task.status)}</span>${series?.active === false ? '<span class="badge">Serie archiviert</span>' : series?.paused ? '<span class="badge">Pausiert</span>' : ''}</div>
      <h3>${h(task.title)}</h3>${!compact && task.description ? `<p class="task-description">${h(task.description)}</p>` : ''}
      <div class="task-meta"><span class="${overdue ? 'overdue' : ''}">${icon('calendar')}${h(shortDate(task.dueDate, now))}${overdue ? ' · überfällig' : ''}</span>${series && recurrenceLabel(series.recurrence) ? `<span>${icon('refresh')}${h(recurrenceLabel(series.recurrence))}</span>` : ''}<span class="task-owner">${owner ? avatar(owner) : icon('users')}${h(owner?.name || 'Für alle offen')}</span></div>
    </div><div class="task-side">${points(task.points)}${taskControls(state, actor, task)}</div>
  </article>`;
}

function eventRow(state, actor, event, now, showDate = true) {
  const participants = (event.members || []).map(id => member(state, id)).filter(Boolean);
  const dotColor = participants[0]?.color || '#8a78b8';
  return `<article class="event-row"><span class="event-dot" style="background:${h(dotColor)}"></span><div class="event-info"><h3>${h(event.title)}</h3><p>${showDate ? `${h(shortDate(eventDate(event), now))} · ` : ''}${h(eventTime(event))}${event.location ? ` <span aria-hidden="true">·</span> ${h(event.location)}` : ''}</p><div class="event-people">${participants.map(person => `<span class="member-chip">${avatar(person)}${h(person.name)}</span>`).join('')}${event.recurrence && event.recurrence !== 'none' ? `<span class="muted">${icon('refresh')}${h(recurrenceLabel(event.recurrence))}</span>` : ''}</div></div>${parent(actor) ? `<div class="row-actions">${iconButton('Termin bearbeiten', 'open-event', `data-id="${h(event.id)}"`)}${iconButton('Termin löschen', 'event-delete', `data-id="${h(event.id)}"`, 'trash')}</div>` : ''}</article>`;
}

function fairnessRows(state, now) {
  return getFairness(state, now).map(item => ({ ...item, person: member(state, item.memberId) })).filter(item => item.person);
}

function familyProgress(state, now, compact = false) {
  return fairnessRows(state, now).map(item => `<div class="member-progress"><div class="member-row">${avatar(item.person)}<div><strong>${h(item.person.name)}</strong><span class="muted">${h(number(item.effort))} von ${h(number(item.target))} Aufgabenpunkten diese Woche · ${h(number(item.completed))} ${item.completed === 1 ? 'Aufgabe erledigt' : 'Aufgaben erledigt'}</span></div><span class="progress-label">${h(number(item.progress))}%</span></div>${progress(item.progress, `Wochenziel von ${item.person.name}`)}${!compact ? `<p class="muted">${item.eligible ? `${icon('star')} Alle persönlichen Schwierigkeitsstufen geschafft` : `Noch offen: ${h((item.needed || []).map(difficultyLabel).join(', ') || 'persönliches Wochenziel')}`}</p>` : ''}</div>`).join('');
}

function houseArt() {
  return `<div class="hero-art" aria-hidden="true"><svg viewBox="0 0 330 230" fill="none"><circle cx="268" cy="43" r="25" fill="#F5C46C"/><path d="M9 207c44-25 80-19 116-15 51 6 85-27 143-13 23 6 39 14 53 28" fill="#D2DBBB"/><path d="M63 105 162 27l100 78" stroke="#6E7860" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/><path d="M81 104v100h163V104L162 42 81 104Z" fill="#F8EFD9"/><path d="M125 147a27 27 0 0 1 54 0v57h-54v-57Z" fill="#B8C5A0"/><circle cx="167" cy="176" r="3" fill="#5E6C50"/><rect x="98" y="110" width="33" height="31" rx="4" fill="#D8C7D8"/><path d="M114 111v30m-16-16h33" stroke="#F8EFD9" stroke-width="4"/><rect x="194" y="110" width="33" height="31" rx="4" fill="#E4BC8D"/><path d="M210 111v30m-16-16h33" stroke="#F8EFD9" stroke-width="4"/><path d="M221 70V32h21v53" fill="#C9957C"/><path d="M44 204v-49m0 31-17-20m17 6 19-21" stroke="#81916C" stroke-width="5" stroke-linecap="round"/><circle cx="42" cy="149" r="21" fill="#A8B78E"/><path d="M281 203v-27m0 14 11-9" stroke="#81916C" stroke-width="4" stroke-linecap="round"/><circle cx="281" cy="169" r="15" fill="#B1BF99"/><path d="m131 76 7-5 7 5m37-2 7-5 7 5" stroke="#D6B88A" stroke-width="3" stroke-linecap="round"/><path d="M149 215c7-10 10-15 10-23" stroke="#E6D6B8" stroke-width="15"/><circle cx="26" cy="64" r="5" fill="#D7C2DC"/><path d="m293 106 3-7 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill="#D7C2DC"/></svg></div>`;
}

function overview(ctx) {
  const { state, actor, now } = ctx;
  const todayDate = currentDate(now);
  const allTasks = tasksFor(state);
  const openTasks = allTasks.filter(task => task.status === 'open' && task.dueDate <= todayDate && !seriesFor(state, task)?.paused);
  const submitted = allTasks.filter(task => task.status === 'submitted');
  const unfinishedShopping = state.shoppingLists.reduce((sum, list) => sum + list.items.filter(item => !item.checked).length, 0);
  const upcoming = getEvents(state, todayDate, addDays(todayDate, 21)).slice(0, 4);
  const featuredTasks = allTasks.filter(task => task.status !== 'approved' && (task.dueDate <= todayDate || ['claimed', 'submitted'].includes(task.status))).sort((a, b) => {
    if (child(actor)) return Number(b.assigneeId === actor.id) - Number(a.assigneeId === actor.id) || dueOrder(a, b);
    return Number(b.status === 'submitted') - Number(a.status === 'submitted') || dueOrder(a, b);
  }).slice(0, 5);
  const fair = fairnessRows(state, now);
  const eligible = fair.filter(item => item.eligible && !item.bonusAwarded).length;
  const hour = Number(new Intl.DateTimeFormat('de-DE', { timeZone: state.family.timezone || 'Europe/Berlin', hour: 'numeric', hourCycle: 'h23' }).format(new Date(now || Date.now())));
  const greeting = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend';
  const cta = parent(actor) ? button('Aufgabe hinzufügen', 'open-task', '', 'primary', 'plus') : button('Aufgaben entdecken', 'nav', 'data-page="tasks"', 'primary', 'arrow');
  const rewards = state.rewards.filter(reward => reward.active !== false).slice(0, 3);
  return `${heading('Euer Familienalltag', 'Schön, dass du da bist.', dateLabel(todayDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}
    <section class="hero"><div class="hero-copy"><span class="badge hero-badge">${icon('leaf')} Zusammen geht’s leichter</span><h2>${h(greeting)}, ${h(actor?.role === 'display' ? state.family.name : actor?.name || state.family.name)}!</h2><p>Viele kleine Beiträge. Mehr Zeit füreinander. Hier findet euer Tag ein gemeinsames Zuhause.</p><div class="hero-actions">${actor?.role === 'display' ? button('Zur Küchenansicht', 'nav', 'data-page="kitchen"', 'primary', 'fullscreen') : cta}${button('Wochenüberblick', 'nav', 'data-page="calendar"', 'ghost', 'calendar')}</div></div>${houseArt()}</section>
    <section class="stats" aria-label="Familie auf einen Blick">
      <button class="stat" data-action="nav" data-page="tasks"><span class="stat-icon sage">${icon('check')}</span><span class="stat-copy"><strong>${h(number(openTasks.length))}</strong><span>Aufgaben für euch</span></span>${icon('arrow')}</button>
      <button class="stat" data-action="nav" data-page="${child(actor) ? 'rewards' : 'tasks'}"><span class="stat-icon peach">${icon(child(actor) ? 'coin' : 'clock')}</span><span class="stat-copy"><strong>${h(number(child(actor) ? balance(state, actor.id) : submitted.length))}</strong><span>${child(actor) ? 'Deine gesammelten Punkte' : 'Warten auf Freigabe'}</span></span>${icon('arrow')}</button>
      <button class="stat" data-action="nav" data-page="fairness"><span class="stat-icon lilac">${icon('star')}</span><span class="stat-copy"><strong>${h(number(fair.reduce((sum, item) => sum + item.completed, 0)))}</strong><span>Diese Woche geschafft</span></span>${icon('arrow')}</button>
      <button class="stat" data-action="nav" data-page="shopping"><span class="stat-icon butter">${icon('bag')}</span><span class="stat-copy"><strong>${h(number(unfinishedShopping))}</strong><span>Noch auf der Einkaufsliste</span></span>${icon('arrow')}</button>
    </section>
    <div class="grid two dashboard-columns"><section class="card"><div class="card-heading"><div><p class="eyebrow">Kleine Taten, große Wirkung</p><h2>${parent(actor) && submitted.length ? 'Das steht jetzt an' : 'Packen wir’s an'}</h2></div>${button('Alle Aufgaben', 'nav', 'data-page="tasks"', 'ghost small', 'arrow')}</div><div class="task-list">${featuredTasks.length ? featuredTasks.map(task => taskCard(state, actor, task, now, true)).join('') : empty('checkCircle', 'Alles im grünen Bereich', 'Gerade ist keine Aufgabe offen. Zeit für etwas Schönes.')}</div></section>
    <section class="card"><div class="card-heading"><div><p class="eyebrow">Gut geplant</p><h2>Die nächsten Termine</h2></div>${button('Kalender', 'nav', 'data-page="calendar"', 'ghost small', 'arrow')}</div>${upcoming.length ? upcoming.map(event => eventRow(state, actor, event, now)).join('') : empty('calendar', 'Freiraum im Kalender', 'Für die nächsten Tage ist noch nichts eingetragen.')}</section></div>
    <div class="grid two dashboard-bottom"><section class="card"><div class="card-heading"><div><p class="eyebrow">Jeder Beitrag zählt</p><h2>Eure gemeinsame Woche</h2></div><span class="badge">${h(number(eligible))} ${eligible === 1 ? 'Wochenbonus' : 'Wochenboni'} bereit</span></div>${familyProgress(state, now, true)}${button('So funktioniert Fairness', 'nav', 'data-page="fairness"', 'ghost small', 'arrow')}</section>
    <section class="card reward-preview"><div class="card-heading"><div><p class="eyebrow">Vorfreude sammeln</p><h2>Darauf könnt ihr euch freuen</h2></div>${button('Alle Belohnungen', 'nav', 'data-page="rewards"', 'ghost small', 'arrow')}</div>${rewards.length ? rewards.map((reward, index) => `<div class="reward-preview-row"><span class="reward-mini-art reward-color-${h(index % 4)}">${icon('gift')}</span><div><strong>${h(reward.title)}</strong><span class="muted">${h(CATEGORIES[reward.category] || 'Belohnung')}</span></div>${points(reward.cost)}</div>`).join('') : empty('gift', 'Platz für Vorfreude', 'Legt gemeinsam fest, wofür ihr Punkte sammeln möchtet.')}</section></div>`;
}

function tasks(ctx) {
  const { state, actor, ui, now } = ctx;
  const allTasks = tasksFor(state);
  const filter = ui.taskFilter || 'active';
  const filters = [ ['active', 'Aktuell'], ...(child(actor) ? [['mine', 'Meine Aufgaben']] : []), ['open', 'Offen'], ['submitted', 'Zur Freigabe'], ['approved', 'Erledigt'] ];
  const matchesFilter = (task) => filter === 'mine' ? task.assigneeId === actor?.id && task.status !== 'approved' : filter === 'active' ? task.status !== 'approved' : task.status === filter;
  const search = (ui.search || '').trim().toLocaleLowerCase('de');
  const visible = allTasks.filter(matchesFilter).filter(task => !search || `${task.title} ${task.description || ''} ${memberName(state, task.assigneeId)}`.toLocaleLowerCase('de').includes(search)).sort(dueOrder);
  return `${heading('Gemeinsam anpacken', 'Kleine Aufgaben. Großes Wir.', 'Übernehmen, erledigen, freuen. Jeder Beitrag macht euren Alltag ein bisschen leichter.', parent(actor) ? button('Neue Aufgabe', 'open-task', '', 'primary', 'plus') : child(actor) ? points(balance(state, actor.id), 'deine Punkte') : '')}
    <div class="toolbar"><div class="tabs" role="group" aria-label="Aufgaben filtern">${filters.map(([key, label]) => `<button type="button" class="tab ${filter === key ? 'active' : ''}" data-action="task-filter" data-filter="${h(key)}" aria-pressed="${filter === key}">${h(label)}<span>${h(number(allTasks.filter(task => key === 'mine' ? task.assigneeId === actor?.id && task.status !== 'approved' : key === 'active' ? task.status !== 'approved' : task.status === key).length))}</span></button>`).join('')}</div><label class="search-field"><span class="sr-only">Aufgaben suchen</span><input class="input" type="search" data-action="search" name="search" placeholder="Aufgabe suchen …" value="${h(ui.search || '')}" autocomplete="off"></label></div>
    ${child(actor) ? `<div class="inline-note">${icon('sparkles')}<p>Du kannst Aufgaben in den Stufen <strong>${h((actor.allowedDifficulties || ['easy', 'medium', 'hard']).map(difficultyLabel).join(' und '))}</strong> übernehmen. Nach der Freigabe landen die Punkte auf deinem Konto.</p></div>` : ''}
    <div class="task-list task-grid">${visible.length ? visible.map(task => taskCard(state, actor, task, now)).join('') : empty('checkCircle', search ? 'Keine passende Aufgabe' : filter === 'submitted' ? 'Alles freigegeben' : filter === 'approved' ? 'Hier sammeln sich eure Erfolge' : 'Gerade nichts zu tun', search ? 'Versuch einen anderen Suchbegriff.' : filter === 'mine' ? 'Such dir bei den offenen Aufgaben etwas aus, das zu dir passt.' : 'Neue Aufgaben erscheinen hier, sobald sie angelegt werden.', parent(actor) && !search ? button('Aufgabe anlegen', 'open-task', '', 'primary small', 'plus') : '')}</div>`;
}

function calendarLegend(state) {
  return `<div class="calendar-legend" aria-label="Kalenderfarben">${state.members.filter(person => person.role !== 'display').map(person => `<span><i class="event-dot" style="background:${h(person.color)}"></i>${h(person.name)}</span>`).join('')}<span><i class="event-dot" style="background:#8a78b8"></i>Gemeinsam</span></div>`;
}

function calendarEvent(state, actor, event) {
  const person = (event.members || []).map(id => member(state, id)).find(Boolean);
  const contents = `<i class="event-dot" style="background:${h(person?.color || '#8a78b8')}"></i><span>${!event.allDay ? `<b>${h(fmtTime(event.start || '00:00'))}</b> ` : ''}${h(event.title)}</span>`;
  return parent(actor)
    ? `<button type="button" class="calendar-event" data-action="open-event" data-id="${h(event.id)}" title="${h(`${event.title} · ${eventTime(event)}`)}">${contents}</button>`
    : `<div class="calendar-event" title="${h(`${event.title} · ${eventTime(event)}`)}">${contents}</div>`;
}

function calendar(ctx) {
  const { state, actor, ui, now } = ctx;
  const todayDate = currentDate(now);
  const mode = ui.calendarMode || 'month';
  const offset = Number(ui.calendarOffset) || 0;
  const anchor = dateObject(todayDate);
  let start, end, title;
  if (mode === 'week') {
    const mondayOffset = (anchor.getUTCDay() + 6) % 7;
    start = addDays(todayDate, -mondayOffset + offset * 7);
    end = addDays(start, 6);
    title = `${dateLabel(start, { day: 'numeric', month: 'short' })} – ${dateLabel(end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  } else {
    const month = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + offset, 1, 12));
    start = dateString(month);
    end = dateString(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0, 12)));
    title = dateLabel(start, { month: 'long', year: 'numeric' });
  }
  const monthStart = start;
  const monthEnd = end;
  if (mode === 'month') {
    const firstOffset = (dateObject(start).getUTCDay() + 6) % 7;
    start = addDays(start, -firstOffset);
    end = addDays(start, 41);
  }
  const events = getEvents(state, start, end);
  const byDate = new Map();
  events.forEach(event => { const key = eventDate(event); if (!byDate.has(key)) byDate.set(key, []); byDate.get(key).push(event); });
  const dates = [];
  for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date);
  const grid = `<div class="calendar-grid ${mode === 'week' ? 'calendar-week' : ''}" role="grid" aria-label="${h(title)}">${WEEKDAYS.map(day => `<div class="calendar-head" role="columnheader">${h(day)}</div>`).join('')}${dates.map(date => `<div class="calendar-cell ${date === todayDate ? 'today' : ''} ${mode === 'month' && (date < monthStart || date > monthEnd) ? 'outside' : ''}" role="gridcell" aria-label="${h(dateLabel(date, { weekday: 'long', day: 'numeric', month: 'long' }))}"><div class="calendar-date-row"><span class="calendar-day" ${date === todayDate ? 'aria-current="date"' : ''}>${h(dateObject(date).getUTCDate())}</span>${parent(actor) ? iconButton(`Termin am ${dateLabel(date)} hinzufügen`, 'open-event', `data-date="${h(date)}"`, 'plus') : ''}</div><div class="calendar-day-events">${(byDate.get(date) || []).map(event => calendarEvent(state, actor, event)).join('')}</div>${mode === 'week' && !(byDate.get(date) || []).length ? '<span class="muted calendar-free">Noch frei</span>' : ''}</div>`).join('')}</div>`;
  const list = `<div class="calendar-list">${events.length ? [...byDate.entries()].map(([date, entries]) => `<section class="calendar-list-day"><div class="calendar-list-date"><strong>${h(dateLabel(date, { day: 'numeric' }))}</strong><span>${h(dateLabel(date, { weekday: 'short', month: 'short' }))}</span>${date === todayDate ? '<span class="badge">Heute</span>' : ''}</div><div>${entries.map(event => eventRow(state, actor, event, now, false)).join('')}</div></section>`).join('') : empty('calendar', 'Noch Raum für Pläne', 'In diesem Monat stehen keine Termine an.', parent(actor) ? button('Termin hinzufügen', 'open-event', `data-date="${h(monthStart)}"`, 'primary small', 'plus') : '')}</div>`;
  return `${heading('Euer gemeinsamer Kalender', 'Alle Pläne an einem Ort.', 'Vom Fußballtraining bis zum Familienabend: So behaltet ihr gemeinsam den Überblick.', parent(actor) ? button('Neuer Termin', 'open-event', '', 'primary', 'plus') : '')}
    <section class="card calendar-card"><div class="calendar-toolbar"><div class="calendar-navigation">${iconButton('Vorheriger Zeitraum', 'calendar-nav', 'data-step="-1"', 'chevronLeft')}<h2>${h(title)}</h2>${iconButton('Nächster Zeitraum', 'calendar-nav', 'data-step="1"', 'chevronRight')}${button('Heute', 'calendar-nav', 'data-step="0"', 'secondary small')}</div><div class="tabs" role="group" aria-label="Kalenderansicht">${[['month', 'Monat'], ['week', 'Woche'], ['list', 'Liste']].map(([key, label]) => `<button class="tab ${mode === key ? 'active' : ''}" type="button" data-action="calendar-mode" data-mode="${h(key)}" aria-pressed="${mode === key}">${h(label)}</button>`).join('')}</div></div>${calendarLegend(state)}${mode === 'list' ? list : grid}</section>
    <aside class="integration-note card"><div class="integration-symbol">${icon('calendar')}</div><div><h3>Google-Kalender: Simulation</h3><p>Probiert einen Beispielimport mit fiktiven Terminen aus. Diese Demo stellt keine Verbindung zu Google her und liest keinen echten Kalender.</p></div>${parent(actor) ? button('Beispieltermine importieren', 'simulated-import', '', 'secondary small', 'download') : '<span class="badge">Demo ohne Verbindung</span>'}</aside>`;
}

function rewardCard(state, actor, reward, index) {
  const available = child(actor) ? balance(state, actor.id) : 0;
  const canAfford = child(actor) && available >= reward.cost;
  const alreadyRequested = state.redemptions.some(item => item.memberId === actor?.id && item.rewardId === reward.id && ['pending', 'requested'].includes(item.status));
  const symbols = { experience: 'sparkles', money: 'coin', screen: 'play', together: 'users' };
  return `<article class="reward-card card"><div class="reward-art reward-color-${h(index % 4)}">${icon(symbols[reward.category] || 'gift')}<span class="reward-art-star star-one">✧</span><span class="reward-art-star star-two">✦</span><span class="badge">${h(CATEGORIES[reward.category] || 'Belohnung')}</span></div><div class="reward-content"><h3>${h(reward.title)}</h3><p>${h(reward.description || 'Ein schöner Moment, auf den ihr euch gemeinsam freuen könnt.')}</p>${points(reward.cost)}${child(actor) ? `<div class="reward-progress">${progress(reward.cost ? available / reward.cost * 100 : 100, `Punkte für ${reward.title}`)}<span class="muted">${canAfford ? 'Du hast genug Punkte gesammelt!' : `Noch ${h(number(Math.max(0, reward.cost - available)))} Punkte bis zu deinem Wunsch`}</span></div><button type="button" class="button ${canAfford && !alreadyRequested ? 'primary' : 'secondary'}" data-action="reward-request" data-id="${h(reward.id)}" ${!canAfford || alreadyRequested ? 'disabled' : ''}>${icon(alreadyRequested ? 'clock' : 'gift')}<span>${alreadyRequested ? 'Anfrage läuft' : canAfford ? 'Belohnung anfragen' : 'Weiter Punkte sammeln'}</span></button>` : parent(actor) ? `<div class="reward-actions">${button('Bearbeiten', 'open-reward', `data-id="${h(reward.id)}"`, 'secondary small', 'edit')}${iconButton('Belohnung archivieren', 'reward-archive', `data-id="${h(reward.id)}"`, 'trash')}</div>` : ''}</div></article>`;
}

function redemptionRow(state, actor, item, now) {
  const pending = ['pending', 'requested'].includes(item.status);
  const status = pending ? 'Angefragt' : item.status === 'approved' ? 'Freigegeben' : item.status === 'rejected' ? 'Abgelehnt' : item.status === 'fulfilled' ? 'Eingelöst' : item.status;
  return `<div class="redemption-row">${avatar(member(state, item.memberId) || { name: '?' })}<div class="redemption-info"><strong>${h(item.title)}</strong><span class="muted">${h(memberName(state, item.memberId))} · ${h(shortDate(String(item.createdAt || '').slice(0, 10), now))}</span></div>${points(item.cost)}<span class="badge status ${pending ? 'submitted' : item.status === 'approved' ? 'approved' : ''}">${h(status)}</span>${parent(actor) && pending ? `<div class="row-actions">${button('Freigeben', 'redemption-action', `data-id="${h(item.id)}" data-op="approve"`, 'primary small', 'check')}${iconButton('Anfrage ablehnen', 'redemption-action', `data-id="${h(item.id)}" data-op="reject"`, 'close')}</div>` : ''}</div>`;
}

function rewards(ctx) {
  const { state, actor, now } = ctx;
  const available = state.rewards.filter(reward => reward.active !== false);
  const requests = state.redemptions.filter(item => !child(actor) || item.memberId === actor.id).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const ledger = state.ledger.filter(item => !child(actor) || item.memberId === actor.id).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 20);
  return `${heading('Vorfreude gehört dazu', 'Kleine Erfolge. Schöne Belohnungen.', 'Sammelt Punkte für Dinge, die euch Freude machen – und entscheidet gemeinsam, was euch wichtig ist.', parent(actor) ? button('Neue Belohnung', 'open-reward', '', 'primary', 'plus') : child(actor) ? `<div class="balance-pill">${icon('coin')}<div><strong>${h(number(balance(state, actor.id)))}</strong><span>deine Punkte</span></div></div>` : '')}
    ${parent(actor) ? `<div class="family-balances">${children(state).map(person => `<div class="balance-card">${avatar(person)}<div><strong>${h(person.name)}</strong><span>${h(number(balance(state, person.id)))} Punkte</span></div>${iconButton(`Punkte von ${person.name} anpassen`, 'open-adjust', `data-id="${h(person.id)}"`, 'plus')}</div>`).join('')}</div>` : ''}
    <div class="grid four reward-grid">${available.length ? available.map((reward, index) => rewardCard(state, actor, reward, index)).join('') : empty('gift', 'Was wünscht ihr euch?', 'Legt eure erste Belohnung gemeinsam an.', parent(actor) ? button('Belohnung anlegen', 'open-reward', '', 'primary small', 'plus') : '')}</div>
    <section class="card"><div class="card-heading"><div><p class="eyebrow">Wünsche werden Wirklichkeit</p><h2>${child(actor) ? 'Deine Anfragen' : 'Belohnungsanfragen'}</h2></div><span class="badge">${h(number(requests.filter(item => ['pending', 'requested'].includes(item.status)).length))} offen</span></div>${requests.length ? requests.map(item => redemptionRow(state, actor, item, now)).join('') : empty('gift', 'Noch keine Anfragen', 'Sobald eine Belohnung angefragt wird, findet ihr sie hier.')}</section>
    <section class="card ledger-card"><div class="card-heading"><div><p class="eyebrow">Alles nachvollziehbar</p><h2>${child(actor) ? 'Dein Punktekonto' : 'Punkteverlauf'}</h2></div><span class="muted">Die letzten 20 Buchungen</span></div>${ledger.length ? `<div class="ledger-list">${ledger.map(entry => `<div class="ledger-row"><span class="ledger-symbol ${entry.amount < 0 ? 'negative' : 'positive'}">${icon(entry.amount < 0 ? 'gift' : 'coin')}</span><div><strong>${h(entry.reason || 'Punktebuchung')}</strong><span class="muted">${!child(actor) ? `${h(memberName(state, entry.memberId))} · ` : ''}${h(shortDate(String(entry.createdAt || '').slice(0, 10), now))}</span></div><strong class="ledger-amount ${entry.amount < 0 ? 'negative' : 'positive'}">${entry.amount > 0 ? '+' : ''}${h(number(entry.amount))} P.</strong></div>`).join('')}</div>` : empty('coin', 'Dein erstes Erfolgserlebnis wartet', 'Freigegebene Aufgaben und eingelöste Belohnungen erscheinen hier.')}</section>`;
}

function shopping(ctx) {
  const { state, actor, ui } = ctx;
  const lists = state.shoppingLists;
  const selected = lists.find(list => list.id === ui.activeListId) || lists[0];
  const mayEdit = writable(actor);
  const done = selected?.items.filter(item => item.checked).length || 0;
  const allItems = selected?.items || [];
  const unchecked = allItems.filter(item => !item.checked);
  const categories = [...new Set(unchecked.map(item => item.category || 'Sonstiges'))];
  const row = (item) => `<div class="shopping-row ${item.checked ? 'checked' : ''}"><button type="button" class="shopping-check" data-action="shopping-toggle" data-id="${h(item.id)}" data-list="${h(selected.id)}" role="checkbox" aria-checked="${Boolean(item.checked)}" aria-label="${h(`${item.name} ${item.checked ? 'wieder auf die Liste setzen' : 'abhaken'}`)}" ${!mayEdit ? 'disabled' : ''}>${item.checked ? icon('check') : ''}</button><div class="shopping-item-info"><strong>${h(item.name)}</strong>${item.checked ? `<span class="muted">${h(item.category || 'Sonstiges')}</span>` : ''}</div><span class="shopping-quantity">${h(item.quantity || '1×')}</span>${mayEdit ? `<div class="row-actions">${iconButton(`${item.name} bearbeiten`, 'open-shopping-item', `data-id="${h(item.id)}" data-list="${h(selected.id)}"`, 'edit')}${iconButton(`${item.name} löschen`, 'shopping-delete', `data-id="${h(item.id)}" data-list="${h(selected.id)}"`, 'trash')}</div>` : ''}</div>`;
  return `${heading('Alles auf einer Liste', 'Damit nichts fehlt.', 'Gemeinsam sammeln, unterwegs abhaken. Eure Einkaufsliste ist immer dabei.', mayEdit ? button('Neue Liste', 'open-list', '', 'secondary', 'plus') : '')}
    <div class="shopping-layout"><aside class="card list-sidebar"><div class="card-heading"><h2>Eure Listen</h2><span class="badge">${h(number(lists.length))}</span></div><div class="shopping-list-tabs">${lists.map(list => `<button type="button" class="list-tab ${selected?.id === list.id ? 'active' : ''}" data-action="select-list" data-id="${h(list.id)}" aria-pressed="${selected?.id === list.id}">${icon('bag')}<span>${h(list.name)}</span><strong>${h(number(list.items.filter(item => !item.checked).length))}</strong></button>`).join('')}</div>${mayEdit ? button('Liste anlegen', 'open-list', '', 'ghost small', 'plus') : ''}<div class="shopping-tip">${icon('leaf')}<p>Ein kurzer Blick in den Kühlschrank spart Wege – und Lebensmittel.</p></div></aside>
    <section class="card shopping-main">${selected ? `<div class="card-heading"><div><p class="eyebrow">Zusammen einkaufen</p><h2>${h(selected.name)}</h2><p class="muted">${h(number(unchecked.length))} ${unchecked.length === 1 ? 'Eintrag' : 'Einträge'} offen · ${h(number(done))} abgehakt</p></div>${parent(actor) ? iconButton('Diese Einkaufsliste löschen', 'delete-list', `data-id="${h(selected.id)}"`, 'trash') : ''}</div>${allItems.length ? progress(done / allItems.length * 100, 'Einkaufsfortschritt') : ''}
      ${mayEdit ? `<form class="shopping-add" data-form="shopping-item"><input type="hidden" name="listId" value="${h(selected.id)}"><label class="field shopping-name"><span>Was fehlt?</span><input class="input" name="name" placeholder="Zum Beispiel Hafermilch" maxlength="100" required autocomplete="off"></label><label class="field shopping-amount"><span>Menge</span><input class="input" name="quantity" placeholder="2 Packungen" maxlength="40"></label><label class="field shopping-category"><span>Kategorie</span><select class="input" name="category"><option>Obst & Gemüse</option><option>Brot & Backwaren</option><option>Milch & Kühlung</option><option>Vorrat</option><option>Haushalt</option><option selected>Sonstiges</option></select></label><button class="button primary" type="submit">${icon('plus')}<span>Hinzufügen</span></button></form>` : ''}
      <div class="shopping-items">${categories.map(category => `<div class="shopping-group"><h3 class="shopping-category-heading">${h(category)} <span>${h(number(unchecked.filter(item => (item.category || 'Sonstiges') === category).length))}</span></h3>${unchecked.filter(item => (item.category || 'Sonstiges') === category).map(row).join('')}</div>`).join('')}${done ? `<div class="shopping-group shopping-completed"><h3 class="shopping-category-heading">Schon im Korb <span>${h(number(done))}</span></h3>${allItems.filter(item => item.checked).map(row).join('')}</div>` : ''}${!allItems.length ? empty('bag', 'Die Liste ist noch leer', mayEdit ? 'Tragt ein, was ihr beim nächsten Einkauf braucht.' : 'Hier erscheinen eure nächsten Einkäufe.') : !unchecked.length ? '<p class="shopping-all-done">Alles eingepackt. Gut gemacht!</p>' : ''}</div>` : empty('bag', 'Platz für eure erste Einkaufsliste', 'Ob Wocheneinkauf oder Familienfest: Eine gemeinsame Liste macht’s leichter.', mayEdit ? button('Erste Liste anlegen', 'open-list', '', 'primary', 'plus') : '')}</section></div>`;
}

function fairness(ctx) {
  const { state, actor, now } = ctx;
  const rows = fairnessRows(state, now);
  const current = currentDate(now);
  const start = addDays(current, -(dateObject(current).getUTCDay() + 6) % 7);
  return `${heading('Jeder trägt etwas bei', 'Fair ist, wenn es zu euch passt.', 'Persönliche Ziele statt Wettbewerb. Jedes Kind bringt sich so ein, wie es zum Alter und Alltag passt.')}
    <section class="fairness-explainer card"><span class="fairness-emblem">${icon('leaf')}</span><div><p class="eyebrow">Eure Woche · ${h(dateLabel(start, { day: 'numeric', month: 'short' }))} bis ${h(dateLabel(addDays(start, 6), { day: 'numeric', month: 'short' }))}</p><h2>Ein kleiner Beitrag aus jeder eigenen Stufe.</h2><p>Für den Wochenbonus zählt mindestens eine freigegebene Aufgabe in jeder freigeschalteten Schwierigkeitsstufe. Wer das schafft, bekommt einmal pro Woche <strong>${h(number(state.family.weeklyBonus))} Bonuspunkte</strong>. Das persönliche Wochenziel zeigt zusätzlich, wie viel ihr euch vorgenommen habt.</p></div></section>
    <div class="grid two fairness-grid">${rows.map(item => {
      const permitted = item.person.allowedDifficulties || ['easy', 'medium', 'hard'];
      return `<article class="card fairness-card"><div class="fairness-member"><div class="member-row">${avatar(item.person)}<div><h2>${h(item.person.name)}</h2><span class="muted">Dein Beitrag zählt</span></div></div>${points(balance(state, item.person.id))}</div><div class="fairness-target"><div><strong>${h(number(item.effort))}<span> / ${h(number(item.target))} Punkte</span></strong><span class="muted">Aufgabenpunkte diese Woche · ${h(number(item.completed))} ${item.completed === 1 ? 'Aufgabe erledigt' : 'Aufgaben erledigt'}</span></div><span class="progress-label">${h(number(item.progress))}%</span></div>${progress(item.progress, `Wochenziel von ${item.person.name}`)}<div class="difficulty-counts">${['easy', 'medium', 'hard'].map(difficulty => {
        const enabled = permitted.includes(difficulty);
        const count = item.counts?.[difficulty] || 0;
        return `<div class="difficulty-count ${enabled ? '' : 'disabled'}"><span class="badge ${h(difficulty)}">${h(difficultyLabel(difficulty))}</span><strong>${h(number(count))}</strong><span>${!enabled ? 'Nicht freigeschaltet' : count ? 'Geschafft' : 'Noch eine Aufgabe'}${enabled && count ? ` ${icon('checkCircle')}` : ''}</span></div>`;
      }).join('')}</div><div class="bonus-status ${item.bonusAwarded ? 'awarded' : item.eligible ? 'eligible' : ''}"><span class="bonus-icon">${icon(item.bonusAwarded ? 'checkCircle' : 'gift')}</span><div><strong>${item.bonusAwarded ? 'Wochenbonus erhalten' : item.eligible ? 'Dein Wochenbonus ist bereit!' : 'Schritt für Schritt zum Wochenbonus'}</strong><p>${item.bonusAwarded ? `${h(number(state.family.weeklyBonus))} Punkte sind bereits auf dem Konto.` : item.eligible ? 'Alle eigenen Schwierigkeitsstufen sind geschafft.' : `Noch offen: ${h((item.needed || []).map(difficultyLabel).join(', ') || 'die nächste Freigabe')}.`}</p></div>${parent(actor) && item.eligible && !item.bonusAwarded ? button('Bonus gutschreiben', 'bonus-claim', `data-id="${h(item.memberId)}"`, 'primary small', 'gift') : ''}</div>${parent(actor) ? `<div class="fairness-actions">${button('Punkte anpassen', 'open-adjust', `data-id="${h(item.memberId)}"`, 'ghost small', 'edit')}${button('Persönliches Ziel ändern', 'open-member', `data-id="${h(item.memberId)}"`, 'ghost small')}</div>` : ''}</article>`;
    }).join('')}</div><aside class="inline-note fairness-note">${icon('users')}<p>Hier gibt es keine Rangliste. Die Ziele und Stufen sind persönlich. Sprecht miteinander darüber, was sich für eure Familie fair anfühlt.</p></aside>`;
}

function family(ctx) {
  const { state, actor } = ctx;
  const people = state.members;
  return `${heading('Euer kleines Team', 'Eine Familie. Viele Stärken.', 'Alle haben ihren Platz – mit eigenen Aufgaben, Wünschen und Möglichkeiten.', parent(actor) ? `${button('Familie bearbeiten', 'open-family', '', 'secondary', 'edit')}${button('Mitglied hinzufügen', 'open-member', '', 'primary', 'plus')}` : '')}
    <section class="family-banner card"><div class="family-banner-icon">${icon('home')}</div><div><p class="eyebrow">Hier seid ihr zu Hause</p><h2>${h(state.family.name)}</h2><p>${h(number(people.filter(person => person.role !== 'display').length))} Familienmitglieder · ${h(state.family.timezone || 'Europe/Berlin')} · ${h(number(state.family.weeklyBonus))} Punkte Wochenbonus</p></div><div class="family-avatar-stack">${people.filter(person => person.role !== 'display').map(person => avatar(person)).join('')}</div></section>
    <div class="grid three member-grid">${people.map(person => `<article class="card member-card"><div class="member-card-top">${avatar(person)}<span class="badge ${h(person.role)}">${h(ROLE_NAMES[person.role] || person.role)}</span></div><h2>${h(person.name)}</h2><p class="muted">${person.role === 'child' ? `${h(person.age || '–')} Jahre · Mit kleinen Schritten groß werden` : person.role === 'parent' ? 'Plant, begleitet und gibt Erfolge frei' : 'Der gemeinsame Blick auf euren Tag'}</p>${person.role === 'child' ? `<div class="member-facts"><div><span>Punktekonto</span><strong>${h(number(balance(state, person.id)))} Punkte</strong></div><div><span>Persönliches Wochenziel</span><strong>${h(number(person.weeklyTarget || 0))} Aufgabenpunkte</strong></div></div><div class="member-difficulties"><span class="muted">Freigeschaltete Stufen</span><div>${(person.allowedDifficulties || []).map(difficulty => `<span class="badge ${h(difficulty)}">${h(difficultyLabel(difficulty))}</span>`).join('')}</div></div>` : `<div class="member-permissions">${icon(person.role === 'parent' ? 'checkCircle' : 'fullscreen')}<p>${person.role === 'parent' ? 'Kann Aufgaben, Termine und Belohnungen verwalten sowie Punkte freigeben.' : 'Zeigt Termine, Aufgaben und Einkäufe übersichtlich und ohne Bearbeitung.'}</p></div>`}${parent(actor) ? `<div class="member-card-actions">${button('Bearbeiten', 'open-member', `data-id="${h(person.id)}"`, 'secondary small', 'edit')}${person.id !== actor.id ? iconButton(`${person.name} entfernen`, 'remove-member', `data-id="${h(person.id)}"`, 'trash') : '<span class="badge">Das bist du</span>'}</div>` : person.id === actor?.id ? '<span class="badge">Das bist du</span>' : ''}</article>`).join('')}</div>
    <aside class="inline-note">${icon('users')}<p>In dieser Demo könnt ihr die Perspektive über die Profilauswahl wechseln. Die Rollen zeigen unterschiedliche Möglichkeiten; alle Daten und Personen sind frei erfunden.</p></aside>`;
}

function kitchen(ctx) {
  const { state, actor, now } = ctx;
  const todayDate = currentDate(now);
  const moment = new Date(now || Date.now());
  const clock = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: state.family.timezone || 'Europe/Berlin' }).format(moment);
  const events = getEvents(state, todayDate, addDays(todayDate, 5)).slice(0, 5);
  const active = tasksFor(state).filter(task => ['open', 'claimed', 'submitted'].includes(task.status)).sort(dueOrder).slice(0, 6);
  const grocery = state.shoppingLists.flatMap(list => list.items.filter(item => !item.checked).map(item => ({ ...item, listName: list.name }))).slice(0, 7);
  return `<div class="kitchen-heading"><div><p class="eyebrow">Das Zuhause im Blick</p><h1 class="page-title">${h(state.family.name)}</h1></div>${button('Vollbild', 'fullscreen', '', 'secondary', 'fullscreen')}</div><section class="kitchen-top"><div class="kitchen-time"><div class="kitchen-clock" data-kitchen-clock aria-label="Aktuelle Uhrzeit">${h(clock)}</div><p>${h(dateLabel(todayDate, { weekday: 'long', day: 'numeric', month: 'long' }))}</p><span class="badge">${icon('home')} Schön, dass ihr zu Hause seid.</span></div><div class="weather">${icon('sun')}<div><strong>19°</strong><span>Sonnig & freundlich</span><small>Beispielwetter · keine Live-Daten</small></div></div></section>
    <div class="grid two kitchen-columns"><section class="card"><div class="card-heading"><div><p class="eyebrow">Heute & demnächst</p><h2>Das habt ihr vor</h2></div>${icon('calendar')}</div>${events.length ? events.map(event => eventRow(state, { role: 'display' }, event, now)).join('') : empty('calendar', 'Heute ist Platz für euch', 'Keine Termine in den nächsten Tagen.')}</section><section class="card"><div class="card-heading"><div><p class="eyebrow">Gemeinsam anpacken</p><h2>Kleine Aufgaben für heute</h2></div>${icon('check')}</div>${active.length ? active.map(task => `<div class="kitchen-task"><span class="kitchen-task-check">${task.status === 'submitted' ? icon('clock') : icon('check')}</span><div><strong>${h(task.title)}</strong><span class="muted">${task.assigneeId ? h(memberName(state, task.assigneeId)) : 'Für alle offen'} · ${h(shortDate(task.dueDate, now))}</span></div><span class="badge ${h(task.difficulty)}">${h(number(task.points))} P.</span></div>`).join('') : empty('checkCircle', 'Alles geschafft', 'Genießt die freie Zeit zusammen.')}</section></div>
    <div class="grid two kitchen-bottom"><section class="card"><div class="card-heading"><div><p class="eyebrow">Jeder Beitrag zählt</p><h2>Eure Woche</h2></div>${icon('star')}</div>${familyProgress(state, now, true)}<div class="kitchen-balances">${children(state).map(person => `<span>${avatar(person)}<strong>${h(person.name)}</strong>${h(number(balance(state, person.id)))} Punkte</span>`).join('')}</div></section><section class="card"><div class="card-heading"><div><p class="eyebrow">Beim nächsten Einkauf</p><h2>Das fehlt noch</h2></div>${icon('bag')}</div>${grocery.length ? grocery.map(item => `<div class="kitchen-grocery"><span class="grocery-dot"></span><strong>${h(item.name)}</strong><span>${h(item.quantity || '1×')}</span></div>`).join('') : empty('bag', 'Alles da', 'Auf euren Einkaufslisten ist gerade nichts offen.')}<p class="muted kitchen-hint">Die Küchenansicht zeigt den aktuellen Stand. Bearbeiten könnt ihr ihn in den jeweiligen Bereichen.</p></section></div>`;
}

function settings(ctx) {
  const { state, actor } = ctx;
  return `${heading('Euer FamilyHub', 'Zum Ausprobieren gemacht.', 'Eine vollständige, fiktive Familie – damit ihr die kleinen und großen Abläufe selbst entdecken könnt.')}
    <section class="card demo-info"><span class="demo-info-icon">${icon('sparkles')}</span><div><span class="badge">Interaktive Browser-Demo</span><h2>Hier könnt ihr euch ausprobieren.</h2><p>FamilyHub speichert eure Änderungen ausschließlich in diesem Browser. Aufgaben, Punkte, Termine und Einkäufe bleiben beim Neuladen erhalten. Die Familie, alle Personen und alle Inhalte sind frei erfunden.</p><p>Diese Demo verwendet keine Anmeldung und keinen Server. Ein Wechsel der Perspektive über das Profilmenü ist jederzeit möglich.</p>${button('Demo-Rundgang starten', 'start-tour', '', 'secondary', 'play')}</div></section>
    <div class="grid two"><section class="card"><div class="card-heading"><div><p class="eyebrow">So wie es zu euch passt</p><h2>Eure Familie</h2></div>${icon('home')}</div><dl class="settings-details"><div><dt>Familienname</dt><dd>${h(state.family.name)}</dd></div><div><dt>Zeitzone</dt><dd>${h(state.family.timezone || 'Europe/Berlin')}</dd></div><div><dt>Wochenbonus</dt><dd>${h(number(state.family.weeklyBonus))} Punkte</dd></div><div><dt>Mitglieder</dt><dd>${h(number(state.members.filter(person => person.role !== 'display').length))} Personen</dd></div></dl>${parent(actor) ? button('Familie bearbeiten', 'open-family', '', 'secondary', 'edit') : button('Familie ansehen', 'nav', 'data-page="family"', 'secondary', 'users')}</section>
    <section class="card"><div class="card-heading"><div><p class="eyebrow">Eure Daten bleiben hier</p><h2>Demo sichern & neu starten</h2></div>${icon('download')}</div><p>Exportiert den aktuellen Stand als JSON-Datei und ladet ihn später wieder ein. Ein Zurücksetzen stellt die ursprüngliche Beispielfamilie wieder her.</p><div class="settings-actions">${button('Demo exportieren', 'export', '', 'secondary', 'download')}${parent(actor) ? `${button('Demo importieren', 'import', '', 'secondary', 'upload')}${button('Demo zurücksetzen', 'reset', '', 'ghost danger', 'refresh')}` : ''}</div><p class="muted">Die Datei enthält nur eure lokalen Demodaten. Ein Import ersetzt den aktuellen Stand in diesem Browser.</p></section></div>
    <section class="card"><div class="card-heading"><div><p class="eyebrow">Was ihr entdecken könnt</p><h2>Ein gemeinsamer Alltag, viele Möglichkeiten</h2></div></div><div class="grid three feature-grid">${[
      ['check', 'Aufgaben & Punkte', 'Aufgaben anlegen, übernehmen, fertig melden und als Elternteil freigeben. Wiederholungen pausieren und Erfolge nachvollziehen.'],
      ['calendar', 'Gemeinsamer Kalender', 'Termine für einzelne Mitglieder oder alle planen. Monat, Woche und Liste mit wiederkehrenden Terminen ausprobieren.'],
      ['gift', 'Belohnungen & Wünsche', 'Punkte sammeln, Belohnungen anfragen und Anfragen freigeben. Jede Buchung bleibt im Punkteverlauf sichtbar.'],
      ['bag', 'Einkaufslisten', 'Mehrere Listen anlegen, Mengen ergänzen und Einkäufe gemeinsam abhaken.'],
      ['users', 'Persönliche Fairness', 'Eigene Wochenziele und altersgerechte Stufen festlegen. Der Wochenbonus belohnt Vielfalt statt Wettbewerb.'],
      ['fullscreen', 'Küchenansicht', 'Uhrzeit, Termine, Aufgaben und Einkäufe auf einem gemeinsamen Bildschirm anzeigen.']
    ].map(([symbol, title, copy]) => `<div class="feature-item"><span class="feature-icon">${icon(symbol)}</span><h3>${h(title)}</h3><p>${h(copy)}</p></div>`).join('')}</div></section>
    <aside class="integration-note card"><div class="integration-symbol">${icon('calendar')}</div><div><h3>Integrationen sind in dieser Demo simuliert.</h3><p>Der Google-Beispielimport fügt ausschließlich fiktive Termine hinzu. Es gibt keine Verbindung zu Google, Nextcloud, Wetterdiensten oder anderen Konten. Die Wetteranzeige ist ein gekennzeichnetes Beispiel.</p></div><span class="badge">Lokal im Browser</span></aside>`;
}

export function renderView(ctx) {
  const actor = typeof ctx.actor === 'string' ? member(ctx.state, ctx.actor) : ctx.actor;
  const context = { ...ctx, actor, ui: ctx.ui || {} };
  const views = { overview, tasks, calendar, rewards, shopping, fairness, family, kitchen, settings };
  return (views[context.ui.page] || overview)(context);
}
