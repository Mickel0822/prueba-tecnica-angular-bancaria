import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { catalogFixture, fillProduct, sampleRows } from './catalog.fixture';

test('lista, busca sin acentos, cambia el tamaño y conserva la página en la URL', async ({
  page,
}) => {
  const fixture = await catalogFixture(page);
  await page.goto('/');
  await expect(page.getByText('5 de 6 resultados')).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByRole('rowheader', { name: /Crédito hipotecario/ })).toBeVisible();
  await expect(page).toHaveURL(/page=2/);
  await page.getByLabel('Por página').selectOption('10');
  await expect(page.getByText('6 de 6 resultados')).toBeVisible();
  await page.getByLabel('Por página').selectOption('20');
  await expect(page.getByLabel('Por página')).toHaveValue('20');
  await page.getByRole('searchbox').fill(' CREDITO ');
  await expect(page.getByText('3 de 3 resultados')).toBeVisible();
  await page.getByRole('searchbox').fill('sin coincidencias');
  await expect(page.getByRole('heading', { name: 'No encontramos coincidencias' })).toBeVisible();
  await page.getByRole('button', { name: 'Limpiar búsqueda' }).click();
  await expect(page.getByText('6 de 6 resultados')).toBeVisible();
  expect(fixture.calls).toEqual(['GET ']);
});

test('muestra skeleton, distingue un error de una lista vacía y permite reintentar', async ({
  page,
}) => {
  let unblock!: () => void;
  const delayed = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  await page.route(
    '**/bp/products',
    async (route) => {
      await delayed;
      await route.fulfill({ status: 503, json: {} });
    },
    { times: 1 },
  );
  await page.goto('/productos', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.table-skeleton')).toBeVisible();
  unblock();
  await expect(
    page.getByRole('heading', { name: 'No se pudieron cargar los productos' }),
  ).toBeVisible();
  await page.route('**/bp/products', (route) => route.fulfill({ json: { data: [] } }));
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(
    page.getByRole('heading', { name: 'Todavía no hay productos registrados' }),
  ).toBeVisible();
});

test('valida, conserva los datos rechazados y crea tras corregirlos', async ({ page }) => {
  const fixture = await catalogFixture(page);
  await page.goto('/productos/nuevo');
  const skip = page.getByRole('link', { name: 'Saltar al contenido' });
  await skip.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  await expect(page).toHaveURL(/\/productos\/nuevo$/);
  await page.getByRole('button', { name: 'Agregar' }).click();
  await expect(page.getByLabel('ID', { exact: true })).toBeFocused();
  await expect(page.getByLabel('ID', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await fillProduct(page, 'nuevo1', 'Cinco');
  await expect(page.getByText('ID disponible.')).toBeVisible();
  await page.getByRole('button', { name: 'Agregar' }).click();
  await expect(
    page.getByText('Ingresa al menos 6 caracteres para guardar este nombre.'),
  ).toBeVisible();
  await expect(page.getByLabel('Descripción')).toHaveValue(
    'Descripción del producto para el catálogo.',
  );
  await page.getByLabel('Nombre', { exact: true }).fill('Cuenta de prueba');
  await page.getByRole('button', { name: 'Agregar' }).click();
  await expect(page.getByRole('rowheader', { name: /Cuenta de prueba/ })).toBeVisible();
  await expect(page.getByText('Producto registrado correctamente')).toBeVisible();
  expect(fixture.calls.filter((call) => call === 'POST ')).toHaveLength(2);
});

test('distingue ID duplicado de un problema de conexión y reinicia', async ({ page }) => {
  const fixture = await catalogFixture(page);
  fixture.fail['GET verification/libre'] = 503;
  await page.goto('/productos/nuevo');
  const id = page.getByLabel('ID', { exact: true });
  const name = page.getByLabel('Nombre', { exact: true });
  await id.fill('trj-crd');
  await name.focus();
  await expect(page.getByText('Este ID ya está registrado.')).toBeVisible();
  await id.fill('libre');
  await name.focus();
  await expect(page.getByText('No se pudo verificar el ID.')).toBeVisible();
  delete fixture.fail['GET verification/libre'];
  await page.getByRole('button', { name: 'Reintentar verificación' }).click();
  await expect(page.getByText('ID disponible.')).toBeVisible();
  const reset = page.getByRole('button', { name: 'Reiniciar', exact: true });
  await reset.click();
  const dialog = page.getByRole('dialog', { name: '¿Reiniciar el formulario?' });
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(id).toHaveValue('libre');
  await expect(reset).toBeFocused();
  await reset.click();
  await dialog.getByRole('button', { name: 'Reiniciar formulario' }).click();
  await expect(id).toHaveValue('');
  await expect(page.getByText('ID disponible.')).toHaveCount(0);
});

test('un solo clic registra el producto aunque el ID se esté verificando', async ({ page }) => {
  const fixture = await catalogFixture(page);
  const name =
    'Tarjeta Visa para compras y viajes con beneficios para clientes preferentes y servicios adicionales';
  let verify!: () => void;
  const verification = new Promise<void>((resolve) => {
    verify = resolve;
  });
  await page.route('**/bp/products/verification/ultimo1', async (route) => {
    await verification;
    await route.fulfill({ json: false });
  });
  await page.setViewportSize({ width: 390, height: 700 });
  await page.clock.install();
  await page.goto('/productos/nuevo');
  await fillProduct(page, 'previo1', name);
  await page.getByLabel('ID', { exact: true }).fill('ultimo1');
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Verificando ID…' })).toBeVisible();
  expect(fixture.calls.filter((call) => call === 'POST ')).toHaveLength(0);
  verify();
  await expect(page).toHaveURL(/\/productos\?page=2$/);
  expect(fixture.calls.filter((call) => call === 'POST ')).toHaveLength(1);
  const notice = page.getByText(`Se agregó «${name}» al catálogo.`);
  await expect(notice).toBeInViewport();
  await page.clock.fastForward(3000);
  await expect(notice).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 768 });
  const card = await page.locator('.notice-region').boundingBox();
  const add = await page.getByRole('link', { name: 'Agregar', exact: true }).boundingBox();
  if (!card || !add) throw new Error('La notificación y la acción Agregar deben estar visibles.');
  expect(card.x).toBeGreaterThan(512);
  expect(card.y + card.height).toBeLessThan(add.y);
  await expect(page.locator('.notice-region button')).toHaveCount(0);
  await expect(page.locator('.notice-region')).toHaveCSS('transition-duration', '0.3s');
  await page.clock.fastForward(3000);
  await expect(notice).toHaveCount(0);
});

test('hace perceptible un fallo de guardado desde las acciones en móvil', async ({ page }) => {
  const fixture = await catalogFixture(page);
  fixture.fail['POST '] = 400;
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto('/productos/nuevo');
  await fillProduct(page, 'nuevo1', 'Cuenta de prueba');
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();
  await expect(page.getByRole('alert')).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('alert')).toBeFocused();
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Cuenta de prueba');
});

test('informa la actualización sin ocultar los productos ya cargados', async ({ page }) => {
  await catalogFixture(page);
  await page.goto('/productos');
  await expect(page.getByRole('table')).toBeVisible();
  await page.getByRole('link', { name: 'Agregar' }).click();
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route(
    '**/bp/products',
    async (route) => {
      await pending;
      await route.fulfill({ json: { data: sampleRows } });
    },
    { times: 1 },
  );
  await page.getByRole('link', { name: 'Volver al listado' }).click();
  await expect(page.getByText('Actualizando productos…')).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.locator('.table-skeleton')).toHaveCount(0);
  finish();
  await expect(page.getByText('Actualizando productos…')).toHaveCount(0);
});

test('edita desde una URL directa y avisa al salir con cambios', async ({ page }) => {
  const rows = sampleRows.map((row) => ({ ...row, logo: '/banco.svg' }));
  const fixture = await catalogFixture(page, rows);
  await page.goto('/productos/trj-crd/editar?q=tarjeta&size=10');
  await expect(page.getByLabel('ID', { exact: true })).toBeDisabled();
  await page.getByLabel('Nombre', { exact: true }).fill('Tarjeta renovada');
  await page.getByRole('link', { name: 'Volver al listado' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('rowheader', { name: /Tarjeta renovada/ })).toBeVisible();
  await expect(page).toHaveURL(/q=tarjeta/);
  await expect(page.getByText('Se actualizó «Tarjeta renovada».')).toBeVisible();
  expect(fixture.rows.get('trj-crd')?.name).toBe('Tarjeta renovada');
});

test('opera el menú con teclado, cancela y ajusta la página al eliminar la última fila', async ({
  page,
}) => {
  const fixture = await catalogFixture(page);
  await page.goto('/productos?page=2');
  const trigger = page.getByRole('button', { name: 'Acciones de Crédito hipotecario' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: 'Editar' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(trigger).toBeFocused();
  expect(fixture.calls.filter((call) => call.startsWith('DELETE'))).toHaveLength(0);
  await trigger.click();
  await page.getByRole('menuitem', { name: 'Eliminar' }).click();
  fixture.fail['DELETE crd-hip'] = 503;
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.getByText(/El producto sigue en el catálogo/)).toBeVisible();
  delete fixture.fail['DELETE crd-hip'];
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.getByText('Se retiró «Crédito hipotecario» del catálogo.')).toBeVisible();
  await expect(page.getByText('5 de 5 resultados')).toBeVisible();
  await expect(page).toHaveURL(/page=1/);
});

test('conserva acceso a las acciones y controla el desbordamiento en pantallas pequeñas', async ({
  page,
}) => {
  await catalogFixture(page, [{ ...sampleRows[0], logo: '/sin-logo.png' }, ...sampleRows.slice(1)]);
  await page.route('**/sin-logo.png', (route) => route.fulfill({ status: 404 }));
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/productos');
    await expect(page.getByText('TC', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await page.getByRole('button', { name: 'Acciones de Tarjeta de crédito' }).click();
    await expect(page.getByRole('menuitem', { name: 'Editar' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
  }
});

for (const surface of ['listado', 'formulario', 'diálogo']) {
  test(`audita la accesibilidad del ${surface}`, async ({ page }) => {
    await catalogFixture(page);
    await page.goto(surface === 'formulario' ? '/productos/nuevo' : '/productos');
    if (surface === 'formulario') {
      await expect(page.getByRole('heading', { name: 'Formulario de registro' })).toBeVisible();
    } else {
      await expect(page.getByRole('table')).toBeVisible();
      if (surface === 'diálogo') {
        await page.getByRole('button', { name: 'Acciones de Tarjeta de crédito' }).click();
        await page.getByRole('menuitem', { name: 'Eliminar' }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
      }
    }
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      results.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map((node) => node.target) })),
    ).toEqual([]);
  });
}
