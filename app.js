const API_URL = 'https://script.google.com/macros/s/AKfycbyvV5ZYGdfIXc8-Gt-CE0qiaIGRtE0MMCuFeGvvxNY7Ll7JxPhzK2zUSetJ_jhiVnMO/exec';
let planRange = 'twoDays';
let fetchedEvents = [];

function dateKey(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character]);
}

function getSecretKey() {
  let key = localStorage.getItem('family_app_secret');
  if (!key) {
    key = prompt('Enter Family App Passcode:');
    if (key) localStorage.setItem('family_app_secret', key);
  }
  return key;
}

function resetSecretKey() {
  localStorage.removeItem('family_app_secret');
  alert('Passcode cleared.');
}

async function fetchEvents() {
  const listEl = document.getElementById('eventsList');
  const todayEl = document.getElementById('todayList');
  const key = getSecretKey();
  listEl.innerHTML = '<div class="status-message">Updating...</div>';
  todayEl.innerHTML = '<div class="status-message">Updating...</div>';

  if (!key) {
    todayEl.innerHTML = '<div class="status-message">Passcode required to load the plan.</div>';
    listEl.innerHTML = '';
    return;
  }

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'list', key })
    });
    const data = await response.json();
    if (!response.ok || data.status === 'unauthorized') throw new Error('unauthorized');
    if (!Array.isArray(data)) throw new Error('invalid_response');

    fetchedEvents = data;
    const today = new Date();
    document.getElementById('todayTitle').textContent = `Today - ${today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`;
    const todayEvents = data.filter(event => event.start.split('T')[0] === dateKey(today));

    todayEl.innerHTML = todayEvents.length
      ? `<div class="event-list">${todayEvents.map(event => `<div class="event-item">${escapeHtml(event.title)}</div>`).join('')}</div>`
      : '<div class="status-message">No activities planned today.</div>';

    renderPlanEvents();
  } catch (error) {
    if (error.message === 'unauthorized') {
      localStorage.removeItem('family_app_secret');
      todayEl.innerHTML = '<div class="status-message error-message">Passcode was not accepted. Refresh to try again.</div>';
      listEl.innerHTML = '';
    } else {
      todayEl.innerHTML = '<div class="status-message error-message">Failed to load today\'s plan.</div>';
      listEl.innerHTML = '<div class="status-message error-message">Failed to load events.</div>';
    }
  }
}

function setPlanRange(range) {
  planRange = range;
  const isTwoDays = range === 'twoDays';
  document.getElementById('planRangeTitle').textContent = isTwoDays ? 'Today & Tomorrow' : 'This Week';
  document.getElementById('twoDaysButton').classList.toggle('selected', isTwoDays);
  document.getElementById('weekButton').classList.toggle('selected', !isTwoDays);
  renderPlanEvents();
}

function renderPlanEvents() {
  const listEl = document.getElementById('eventsList');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + (planRange === 'twoDays' ? 1 : 6));
  const visibleEvents = fetchedEvents.filter(event => {
    const eventDate = new Date(`${event.start.split('T')[0]}T00:00:00`);
    return eventDate >= today && eventDate <= endDate;
  });

  if (visibleEvents.length === 0) {
    listEl.innerHTML = '<div class="status-message">No activities planned.</div>';
    return;
  }

  const grouped = {};
  visibleEvents.forEach(event => {
    const eventDate = event.start.split('T')[0];
    if (!grouped[eventDate]) grouped[eventDate] = [];
    grouped[eventDate].push(event);
  });

  listEl.innerHTML = Object.keys(grouped).sort().map(eventDate => `
    <div class="plan-day">
      <div class="plan-date">${new Date(`${eventDate}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
      <div class="event-list">
        ${grouped[eventDate].map(event => `<div class="event-item">${escapeHtml(event.title)}</div>`).join('')}
      </div>
    </div>
  `).join('');
}

async function postEvent(title, dateOverride, options = {}) {
  const date = dateOverride || document.getElementById('eventDate').value;
  const key = getSecretKey();
  if (!date) {
    alert('Select a date!');
    return false;
  }
  if (!key) {
    alert('Passcode required to post events.');
    return false;
  }

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'create', key, title, date, isAllDay: true, ...options })
    });
    const result = await response.json();
    if (!response.ok || result.status !== 'success') {
      if (result.status === 'unauthorized') localStorage.removeItem('family_app_secret');
      throw new Error(result.status || 'request_failed');
    }

    document.getElementById('customNote').value = '';
    if (!dateOverride) fetchEvents();
    return true;
  } catch (error) {
    alert(error.message === 'unauthorized' ? 'Passcode was not accepted.' : 'Could not save the activity.');
    return false;
  }
}

function switchTab(tab) {
  const isToday = tab === 'today';
  document.getElementById('todayPanel').classList.toggle('hidden', !isToday);
  document.getElementById('addPanel').classList.toggle('hidden', isToday);
  document.getElementById('todayTab').setAttribute('aria-selected', String(isToday));
  document.getElementById('addTab').setAttribute('aria-selected', String(!isToday));
}

function updateCarpoolDriverFields() {
  const isWholeWeek = document.getElementById('carpoolSchedule').value === 'week';
  document.getElementById('carpoolDriver').closest('label').classList.toggle('hidden', isWholeWeek);
  document.getElementById('weeklyCarpoolDrivers').classList.toggle('hidden', !isWholeWeek);
}

async function submitCarpoolTurn() {
  const trip = document.getElementById('carpoolTrip').value;
  const schedule = document.getElementById('carpoolSchedule').value;

  if (schedule === 'day') {
    const driver = document.getElementById('carpoolDriver').value;
    await postEvent(`Our Turn Carpool: ${trip} - ${driver}`);
    return;
  }

  const selectedDate = document.getElementById('eventDate').value;
  if (!selectedDate) return alert('Select a date!');

  const firstDay = new Date(`${selectedDate}T12:00:00`);
  firstDay.setDate(firstDay.getDate() - ((firstDay.getDay() + 6) % 7));
  const schoolWeekDates = Array.from({ length: 5 }, (_, index) => {
    const date = new Date(firstDay);
    date.setDate(firstDay.getDate() + index);
    return dateKey(date);
  });

  const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  await Promise.all(schoolWeekDates.map((date, index) => {
    const driver = document.getElementById(`carpoolDriver${weekdayNames[index]}`).value;
    return postEvent(`Our Turn Carpool: ${trip} - ${driver}`, date);
  }));
  fetchEvents();
}

function getNextWeekdayDate(selectedDate, weekday) {
  const date = new Date(`${selectedDate}T12:00:00`);
  date.setDate(date.getDate() + ((weekday - date.getDay() + 7) % 7));
  return dateKey(date);
}

async function submitKidsActivity() {
  const activity = document.getElementById('kidsActivityName').value.trim();
  const selectedDate = document.getElementById('eventDate').value;
  const schedule = document.getElementById('kidsActivitySchedule').value;
  if (!activity) return alert('Enter an activity name!');
  if (!selectedDate) return alert('Select a date!');

  const title = `Kids Activity: ${activity}`;
  if (schedule === 'day') {
    await postEvent(title);
    return;
  }

  const weekdayName = document.getElementById('kidsActivityWeekday').value;
  const weekdayNumber = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'].indexOf(weekdayName);
  await postEvent(title, getNextWeekdayDate(selectedDate, weekdayNumber), { recurrenceWeekday: weekdayName });
}

function submitCustom() {
  const note = document.getElementById('customNote').value.trim();
  if (note) postEvent(note);
}

function registerEventHandlers() {
  document.getElementById('refreshButton').addEventListener('click', fetchEvents);
  document.getElementById('todayTab').addEventListener('click', () => switchTab('today'));
  document.getElementById('addTab').addEventListener('click', () => switchTab('add'));
  document.getElementById('twoDaysButton').addEventListener('click', () => setPlanRange('twoDays'));
  document.getElementById('weekButton').addEventListener('click', () => setPlanRange('week'));
  document.getElementById('resetPasscodeButton').addEventListener('click', resetSecretKey);
  document.querySelectorAll('[data-preset]').forEach(button => {
    button.addEventListener('click', () => postEvent(button.dataset.preset));
  });
  document.getElementById('carpoolSchedule').addEventListener('change', updateCarpoolDriverFields);
  document.getElementById('addCarpoolButton').addEventListener('click', submitCarpoolTurn);
  document.getElementById('addKidsActivityButton').addEventListener('click', submitKidsActivity);
  document.getElementById('addCustomButton').addEventListener('click', submitCustom);
}

registerEventHandlers();
updateCarpoolDriverFields();
document.getElementById('eventDate').value = dateKey(new Date());
fetchEvents();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js'));
}
