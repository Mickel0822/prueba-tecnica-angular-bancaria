import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { fillProduct } from './catalog.fixture';

test('integra el flujo completo con la API proporcionada', async ({ page, request }) => {
  const id = 'qa' + randomBytes(4).toString('hex');
  const item = '/bp/products/' + id;
  await expect((await request.get('/bp/products')).ok()).toBeTruthy();
  try {
    await page.goto('/productos/nuevo');
    await fillProduct(page, id, 'Cinco');
    await expect(page.getByText('ID disponible.')).toBeVisible();
    await page.getByRole('button', { name: 'Agregar' }).click();
    await expect(
      page.getByText('Ingresa al menos 6 caracteres para guardar este nombre.'),
    ).toBeVisible();
    await page.getByLabel('Nombre', { exact: true }).fill('Cuenta integración ' + id);
    await page.getByRole('button', { name: 'Agregar' }).click();
    const added = page.getByRole('rowheader', { name: new RegExp('Cuenta integración ' + id) });
    await expect(added).toBeVisible();
    await expect((await request.get(item)).ok()).toBeTruthy();

    await page.getByRole('button', { name: 'Acciones de Cuenta integración ' + id }).click();
    await page.getByRole('menuitem', { name: 'Editar' }).click();
    await expect(page.getByLabel('ID', { exact: true })).toBeDisabled();
    await page.getByLabel('Nombre', { exact: true }).fill('Cuenta editada ' + id);
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await page.getByRole('searchbox').fill(id);
    await expect(
      page.getByRole('rowheader', { name: new RegExp('Cuenta editada ' + id) }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Acciones de Cuenta editada ' + id }).click();
    await page.getByRole('menuitem', { name: 'Eliminar' }).click();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect((await request.get(item)).ok()).toBeTruthy();
    await page.getByRole('button', { name: 'Acciones de Cuenta editada ' + id }).click();
    await page.getByRole('menuitem', { name: 'Eliminar' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
    await expect(page.getByText('Producto eliminado.')).toBeVisible();
    expect((await request.get(item)).status()).toBe(404);
  } finally {
    if ((await request.get(item)).ok()) await request.delete(item);
  }
});
