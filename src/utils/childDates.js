// Mobildeki src/utils/childDates.js dosyasının birebir web karşılığı.
// (RN'e bağımlı değil, doğrudan taşındı.)

export function getChildBirthDate(child) {
  if (!child || typeof child !== 'object') return '';
  return (
    child.dogumTarihi ||
    child.doğumTarihi ||
    child.birthDate ||
    child.birthday ||
    child.dogum_tarihi ||
    child.dogum ||
    child.dogumGunu ||
    child.tarih ||
    ''
  );
}

export function parseChildBirthDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const trMatch = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (trMatch) {
    const [, day, month, year] = trMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const compactMatch = raw.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (compactMatch) {
    const [, day, month, year] = compactMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export function formatChildBirthDate(value) {
  const date = parseChildBirthDate(value);
  if (!date) return 'Belirtilmemiş';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

export function calculateChildAge(value) {
  const birth = parseChildBirthDate(value);
  if (!birth) return '';

  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();

  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years < 0) return '';
  if (years <= 0) return `${Math.max(months, 0)} aylık`;
  return months > 0 ? `${years} yaş ${months} ay` : `${years} yaş`;
}

export function normalizeChildBirthDate(value) {
  const date = parseChildBirthDate(value);
  if (!date) return String(value || '').trim();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
