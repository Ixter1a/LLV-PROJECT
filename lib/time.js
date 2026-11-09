const TZ = 'Asia/Vladivostok';
const OFFSET = '+10:00';

function zonedDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function weekdayIndex(date = new Date()) {
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
  }).format(date);
  return { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[wd] ?? 0;
}

function startOfToday(now = new Date()) {
  return new Date(`${zonedDay(now)}T00:00:00${OFFSET}`);
}

function rangeStart(range, now = new Date()) {
  if (range === 'all') return null;
  if (range === 'week') {
    const day = startOfToday(now);
    return new Date(day.getTime() - weekdayIndex(now) * 86400000);
  }
  if (range === 'month') {
    const [year, month] = zonedDay(now).split('-');
    return new Date(`${year}-${month}-01T00:00:00${OFFSET}`);
  }
  return startOfToday(now);
}

module.exports = { TZ, rangeStart, zonedDay };
