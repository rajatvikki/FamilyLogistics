const assert = require('assert');
const fs = require('fs');
const TEST_SECRET_KEY = 'test-only-secret';

const createdEvents = [];
const calendar = {
  createAllDayEvent(title, date) {
    const event = createMockEvent(title, date, date, true);
    createdEvents.push(event);
    return event;
  },
  createAllDayEventSeries(title, date, recurrence) {
    const event = createMockEvent(title, date, date, true);
    event.recurrenceWeekday = recurrence.weekday;
    createdEvents.push(event);
    return event;
  },
  createEvent(title, start, end) {
    const event = createMockEvent(title, start, end, false);
    createdEvents.push(event);
    return event;
  },
  getEvents() {
    return createdEvents;
  }
};

function createMockEvent(title, start, end, isAllDay) {
  return {
    title,
    start,
    end,
    isAllDay,
    description: '',
    reminders: [],
    getId: () => `mock-event-${createdEvents.length + 1}`,
    getTitle() { return this.title; },
    getStartTime() { return this.start; },
    getEndTime() { return this.end; },
    isAllDayEvent() { return this.isAllDay; },
    getDescription() { return this.description; },
    setDescription(notes) { this.description = notes; },
    addPopupReminder(minutes) { this.reminders.push(minutes); }
  };
}

global.CalendarApp = {
  getCalendarsByName: () => [calendar],
  createCalendar: () => calendar,
  Weekday: {
    MONDAY: 'MONDAY', TUESDAY: 'TUESDAY', WEDNESDAY: 'WEDNESDAY',
    THURSDAY: 'THURSDAY', FRIDAY: 'FRIDAY', SATURDAY: 'SATURDAY', SUNDAY: 'SUNDAY'
  },
  newRecurrence: () => ({
    addWeeklyRule() {
      return {
        onlyOnWeekday(weekday) {
          return { weekday };
        }
      };
    }
  })
};

global.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: propertyName => propertyName === 'FAMILY_APP_SECRET' ? TEST_SECRET_KEY : null
  })
};

global.ContentService = {
  MimeType: { JSON: 'application/json' },
  createTextOutput: content => ({
    content,
    setMimeType() { return this; }
  })
};

eval(fs.readFileSync('./Code.js', 'utf8'));

function post(payload) {
  return doPost({ postData: { contents: JSON.stringify(payload) } });
}

const unauthorized = JSON.parse(post({ title: 'Ignored event', date: '2026-09-01' }).content);
assert.deepStrictEqual(unauthorized, { status: 'unauthorized' });
assert.strictEqual(createdEvents.length, 0);

const allDayResult = JSON.parse(post({
  key: TEST_SECRET_KEY,
  title: 'Our Turn Carpool: Drop-off - Dad',
  date: '2026-09-01',
  isAllDay: true,
  notes: 'Bring booster seats'
}).content);
assert.strictEqual(allDayResult.status, 'success');
assert.strictEqual(createdEvents.length, 1);
assert.strictEqual(createdEvents[0].isAllDay, true);
assert.strictEqual(createdEvents[0].title, 'Our Turn Carpool: Drop-off - Dad');
assert.strictEqual(createdEvents[0].description, 'Bring booster seats');
assert.deepStrictEqual(createdEvents[0].reminders, [15]);

const timedResult = JSON.parse(post({
  key: TEST_SECRET_KEY,
  title: 'Dentist appointment',
  date: '2026-09-02',
  time: '14:00:00',
  isAllDay: false
}).content);
assert.strictEqual(timedResult.status, 'success');
assert.strictEqual(createdEvents.length, 2);
assert.strictEqual(createdEvents[1].isAllDay, false);
assert.strictEqual(createdEvents[1].end - createdEvents[1].start, 30 * 60 * 1000);
assert.deepStrictEqual(createdEvents[1].reminders, [15]);

const recurringResult = JSON.parse(post({
  key: TEST_SECRET_KEY,
  title: 'Kids Activity: Soccer',
  date: '2026-09-07',
  isAllDay: true,
  recurrenceWeekday: 'MONDAY'
}).content);
assert.strictEqual(recurringResult.status, 'success');
assert.strictEqual(createdEvents.length, 3);
assert.strictEqual(createdEvents[2].recurrenceWeekday, 'MONDAY');
assert.deepStrictEqual(createdEvents[2].reminders, [15]);

const unauthorizedGet = JSON.parse(doGet({ parameter: {} }).content);
assert.deepStrictEqual(unauthorizedGet, { status: 'unauthorized' });

const events = JSON.parse(doGet({ parameter: { key: TEST_SECRET_KEY } }).content);
assert.strictEqual(events.length, 3);
assert.strictEqual(events[0].title, 'Our Turn Carpool: Drop-off - Dad');

console.log('Backend tests passed: protected reads and writes, all-day events, timed events, weekly series, notes, reminders, and event retrieval.');