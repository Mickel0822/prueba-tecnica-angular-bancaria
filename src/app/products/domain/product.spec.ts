import {
  displayDate,
  filterProducts,
  imageSource,
  isCalendarDate,
  pageNumber,
  pageSize,
  paginate,
  Product,
  releaseError,
  revisionDate,
  textError,
  textLimits,
  today,
} from './product';

const product: Product = {
  id: 'trj-crd',
  name: 'Tarjeta de crédito',
  description: 'Compras en cuotas',
  logo: 'banco.svg',
  dateRelease: '2028-02-29',
  dateRevision: '2029-02-28',
};

describe('Reglas del catálogo', () => {
  it.each([
    ['id', 3, 10],
    ['name', 5, 100],
    ['description', 10, 200],
  ] as const)('valida los límites de %s', (field, min, max) => {
    const limits = textLimits[field];
    expect(textError('  ', limits)).toMatch(/requerido/);
    expect(textError('a'.repeat(min - 1), limits)).toContain(String(min));
    expect(textError('a'.repeat(min), limits)).toBeNull();
    expect(textError('a'.repeat(max), limits)).toBeNull();
    expect(textError('a'.repeat(max + 1), limits)).toContain(String(max));
  });

  it('admite una referencia de logo no vacía', () => {
    expect(textError('', textLimits.logo)).toMatch(/requerido/);
    expect(textError('assets-1.png', textLimits.logo)).toBeNull();
  });

  it.each([
    '2027-02-29',
    '1900-02-29',
    '2027-04-31',
    '2027-13-01',
    '2027-00-01',
    '2027-01-00',
    '0000-01-01',
    '1/2/2027',
  ])('rechaza una fecha inválida: %s', (value) => expect(isCalendarDate(value)).toBe(false));

  it('calcula fechas de calendario sin conversión de zona horaria', () => {
    expect(today(new Date(2026, 10, 8, 23, 59))).toBe('2026-11-08');
    expect(isCalendarDate('2000-02-29')).toBe(true);
    expect(revisionDate('2028-02-29')).toBe('2029-02-28');
    expect(revisionDate('2027-04-30')).toBe('2028-04-30');
    expect(revisionDate('2027-12-31')).toBe('2028-12-31');
    expect(revisionDate('2027-04-31')).toBe('');
    expect(revisionDate('9999-01-01')).toBe('');
    expect(displayDate('2028-02-29')).toBe('29/02/2028');
    expect(displayDate('')).toBe('Fecha no disponible');
  });

  it('acepta desde hoy y rechaza fechas anteriores o incompletas', () => {
    const current = '2026-11-08';
    expect(releaseError('', current)).toContain('liberación');
    expect(releaseError('2026-11-07', current)).toContain('hoy');
    expect(releaseError('2026-11-08', current)).toBeNull();
    expect(releaseError('2026-11-09', current)).toBeNull();
    expect(releaseError('2026-11-32', current)).toContain('válida');
    expect(releaseError('9999-01-01', current)).toContain('válida');
  });

  it.each([' CREDITO ', 'CUOTAS', 'TRJ-CRD', '  '])('encuentra productos para %s', (query) => {
    expect(filterProducts([product], query)).toEqual([product]);
    expect(filterProducts([product], 'ahorro')).toEqual([]);
  });

  it.each([0, 1, 5, 6, 10, 11, 20, 21])('ajusta la última página con %i resultados', (count) => {
    const rows = Array.from({ length: count }, (_, index) => ({ ...product, id: String(index) }));
    const last = paginate(rows, 99, 5);
    expect(last.page).toBe(Math.max(1, Math.ceil(count / 5)));
    expect(last.rows).toEqual(rows.slice((last.page - 1) * 5));
    expect(paginate(rows, 0, 10).rows).toEqual(rows.slice(0, 10));
  });

  it('normaliza tamaños y páginas inválidos', () => {
    expect([null, '5', '10', '20', '500'].map(pageSize)).toEqual([5, 5, 10, 20, 5]);
    expect([null, '0', '-2', '1.5', 'texto', '2'].map(pageNumber)).toEqual([1, 1, 1, 1, 1, 2]);
  });

  it.each([
    '',
    'javascript:alert(1)',
    'data:image/svg+xml,abc',
    '//example.com/a',
    'https://u:p@example.com/a',
    'https://[',
    '\\host\\a',
  ])('evita representar una dirección de imagen inválida: %s', (value) =>
    expect(imageSource(value)).toBeNull(),
  );

  it('admite imágenes relativas o HTTPS', () => {
    expect(imageSource(' /banco.svg ')).toBe('/banco.svg');
    expect(imageSource('https://example.com/logo.jpg')).toBe('https://example.com/logo.jpg');
  });
});
