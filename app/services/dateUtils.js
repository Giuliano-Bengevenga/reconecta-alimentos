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
  return DateTime.fromISO(value, { zone: 'utc' }).setZone(ZONE).toFormat("dd/MM/yyyy 'às' HH:mm");
}

function isPast(value) {
  return DateTime.fromISO(value, { zone: 'utc' }).toMillis() <= Date.now();
}

module.exports = { ZONE, nowIso, localToUtc, format, isPast };
