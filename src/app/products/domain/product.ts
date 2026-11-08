export interface ProductDetails {
  name: string;
  description: string;
  logo: string;
  dateRelease: string;
  dateRevision: string;
}

export interface Product extends ProductDetails {
  id: string;
}

export function today(now = new Date()): string {
  return dateText(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function dateText(year: number, month: number, day: number): string {
  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function revisionDate(value: string): string {
  if (!isCalendarDate(value)) return '';
  const [year, month, day] = value.split('-').map(Number);
  if (year === 9999) return '';
  return dateText(year + 1, month, Math.min(day, daysInMonth(year + 1, month)));
}

export function displayDate(value: string): string {
  return isCalendarDate(value) ? value.split('-').reverse().join('/') : 'Fecha no disponible';
}

export const textLimits = {
  id: [3, 10],
  name: [5, 100],
  description: [10, 200],
  logo: [1, Infinity],
} as const;

export function textError(value: string, [min, max]: readonly [number, number]): string | null {
  const length = Array.from(value.trim()).length;
  if (!length) return 'Este campo es requerido.';
  if (length < min) return `Ingresa al menos ${min} caracteres.`;
  if (length > max) return `Ingresa como máximo ${max} caracteres.`;
  return null;
}

export function releaseError(value: string, current = today()): string | null {
  if (!value) return 'Ingresa la fecha de liberación.';
  if (!isCalendarDate(value) || !revisionDate(value)) return 'Ingresa una fecha válida.';
  return value < current ? 'La fecha debe ser igual o posterior a hoy.' : null;
}

export function normalizeSearch(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export function filterProducts(products: readonly Product[], query: string): readonly Product[] {
  const term = normalizeSearch(query);
  if (!term) return products;
  return products.filter((product) =>
    [product.id, product.name, product.description].some((value) =>
      normalizeSearch(value).includes(term),
    ),
  );
}

export type PageSize = 5 | 10 | 20;

export function pageSize(value: string | null): PageSize {
  if (value === '10') return 10;
  if (value === '20') return 20;
  return 5;
}

export function pageNumber(value: string | null): number {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function paginate(products: readonly Product[], requested: number, size: PageSize) {
  const pages = Math.max(1, Math.ceil(products.length / size));
  const page = Math.max(1, Math.min(requested, pages));
  const start = (page - 1) * size;
  return { page, pages, rows: products.slice(start, start + size), total: products.length };
}

export function imageSource(value: string): string | null {
  const source = value.trim();
  if (!source || source.startsWith('//') || source.includes('\\')) return null;
  if (Array.from(source).some((character) => character.charCodeAt(0) < 32)) return null;
  try {
    const url = new URL(source, 'https://catalog.invalid/');
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? source
      : null;
  } catch {
    return null;
  }
}
