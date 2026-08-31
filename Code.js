const CALENDAR_NAME = "Family Logistics";

function getCalendar() {
  const cals = CalendarApp.getCalendarsByName(CALENDAR_NAME);
  if (cals.length > 0) return cals[0];
  return CalendarApp.createCalendar(CALENDAR_NAME);
}

function doGet(e) {
  const secretKey = getSecretKey();
  const requestKey = e && e.parameter ? e.parameter.key : null;
  if (!secretKey || requestKey !== secretKey) {
    return ContentService.createTextOutput(JSON.stringify({ status: "unauthorized" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const cal = getCalendar();
  const now = new Date();
  // Fetch events for the past 2 days and next 14 days
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14);

  const events = cal.getEvents(start, end);
  const result = events.map(evt => ({
    id: evt.getId(),
    title: evt.getTitle(),
    start: evt.getStartTime().toISOString(),
    end: evt.getEndTime().toISOString(),
    isAllDay: evt.isAllDayEvent(),
    description: evt.getDescription() || ""
  }));

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

const SECRET_PROPERTY_NAME = "FAMILY_APP_SECRET";

function getSecretKey() {
  return PropertiesService.getScriptProperties().getProperty(SECRET_PROPERTY_NAME);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const secretKey = getSecretKey();

    if (!secretKey || data.key !== secretKey) {
        return ContentService.createTextOutput(JSON.stringify({ status: "unauthorized" }));
      }

    const cal = getCalendar();
    
    const eventDate = new Date(data.date + "T" + (data.time || "08:00:00"));
    let event;

    if (data.isAllDay) {
      const allDayDate = new Date(data.date + "T00:00:00");
      if (data.recurrenceWeekday) {
        const weekday = CalendarApp.Weekday[data.recurrenceWeekday];
        if (!weekday) throw new Error("Invalid recurrence weekday");
        const recurrence = CalendarApp.newRecurrence().addWeeklyRule().onlyOnWeekday(weekday);
        event = cal.createAllDayEventSeries(data.title, allDayDate, recurrence);
      } else {
        event = cal.createAllDayEvent(data.title, allDayDate);
      }
    } else {
      const endTime = new Date(eventDate.getTime() + 30 * 60 * 1000);
      event = cal.createEvent(data.title, eventDate, endTime);
    }

    if (data.notes) {
      event.setDescription(data.notes);
    }

    // Default 15-minute push notification reminder
    event.addPopupReminder(15);

    return ContentService.createTextOutput(JSON.stringify({ status: "success", id: event.getId() }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}