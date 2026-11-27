const { DateTime } = require('luxon');

const ZONE = 'America/Sao_Paulo';

function nowIso() {
  return new Date().toISOString();
}

function localToUtc(value) {
  if (!value) return null;
  const parsed = DateTime.fromISO(value, { zone: ZONE, setZone: false });
  if (!parsed.isValid) return null;
  return parsed.toUTC().toISO();
}

function format(value) {
  if (!value) return '—';
  const parsed = value instanceof Date
    ? DateTime.fromJSDate(value, { zone: 'utc' })
    : DateTime.fromISO(value, { zone: 'utc' });
  return parsed.setZone(ZONE).toFormat("dd/MM/yyyy 'às' HH:mm");
}

function isPast(value) {
  const parsed = value instanceof Date
    ? DateTime.fromJSDate(value, { zone: 'utc' })
    : DateTime.fromISO(value, { zone: 'utc' });
  return parsed.toMillis() <= Date.now();
}

module.exports = { ZONE, nowIso, localToUtc, format, isPast };
