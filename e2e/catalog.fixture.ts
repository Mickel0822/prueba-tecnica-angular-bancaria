import type { Page } from '@playwright/test';
import { revisionDate } from '../src/app/products/domain/product';

export const future = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
const nextYear = revisionDate(future);

export interface ProductRow {
  id: string;
  name: string;
  description: string;
  logo: string;
  date_release: string;
  date_revision: string;
}

export const sampleRows: ProductRow[] = [
  ['trj-crd', 'Tarjeta de crédito', 'Compras diarias y pagos diferidos.'],
  ['cta-ah', 'Cuenta de ahorros', 'Ahorro flexible con disponibilidad inmediata.'],
  ['crd-veh', 'Crédito vehicular', 'Financiamiento para la compra de un vehículo.'],
  ['inv-plz', 'Inversión a plazo', 'Depósito con tasa fija y plazo definido.'],
  ['cta-jov', 'Cuenta joven', 'Una cuenta para empezar a ahorrar.'],
  ['crd-hip', 'Crédito hipotecario', 'Financiamiento para adquisición de vivienda.'],
].map(([id, name, description]) => ({
  id,
  name,
  description,
  logo: '',
  date_release: future,
  date_revision: nextYear,
}));

export async function catalogFixture(page: Page, initialRows = sampleRows) {
  const rows = new Map(initialRows.map((row) => [row.id, { ...row }]));
  const calls: string[] = [];
  const fail: Record<string, number | undefined> = {};
  await page.route('**/bp/products**', async (route) => {
    const request = route.request();
    const parts = new URL(request.url()).pathname.split('/').slice(3).map(decodeURIComponent);
    const method = request.method();
    const key = method + ' ' + parts.join('/');
    calls.push(key);
    const status = fail[key];
    if (status) return route.fulfill({ status, json: { message: 'Solicitud rechazada' } });
    if (method === 'GET') {
      if (!parts.length) return route.fulfill({ json: { data: [...rows.values()] } });
      if (parts[0] === 'verification') return route.fulfill({ json: rows.has(parts[1]) });
      const row = rows.get(parts[0]);
      return row ? route.fulfill({ json: row }) : route.fulfill({ status: 404, json: {} });
    }
    if (method === 'POST') {
      const product = request.postDataJSON() as ProductRow;
      if (product.name.length === 5)
        return route.fulfill({
          status: 400,
          json: { errors: [{ property: 'name', constraints: { minLength: '6' } }] },
        });
      rows.set(product.id, product);
      return route.fulfill({ status: 200, json: { data: product } });
    }
    const id = parts[0];
    if (method === 'PUT') {
      const details = request.postDataJSON() as Omit<ProductRow, 'id'>;
      if ('id' in details) return route.fulfill({ status: 400, json: {} });
      rows.set(id, { id, ...details });
      return route.fulfill({ json: { data: details } });
    }
    rows.delete(id);
    return route.fulfill({ json: { message: 'Product removed successfully' } });
  });
  return { rows, calls, fail };
}

export async function fillProduct(page: Page, id: string, name: string, logo = '/banco.svg') {
  await page.getByLabel('ID', { exact: true }).fill(id);
  await page.getByLabel('Nombre', { exact: true }).fill(name);
  await page
    .getByLabel('Descripción', { exact: true })
    .fill('Descripción del producto para el catálogo.');
  await page.getByLabel('Logo', { exact: true }).fill(logo);
  await page.getByLabel('Fecha de liberación', { exact: true }).fill(future);
}
