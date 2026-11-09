import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, Subject, throwError } from 'rxjs';
import { App } from '../../app';
import { routes } from '../../app.routes';
import { Catalog, Notices } from '../application/catalog';
import { PRODUCTS_REPOSITORY, ProductsRepository } from '../application/products-repository';
import { Product, today } from '../domain/product';

const row: Product = {
  id: 'abc',
  name: 'Tarjeta de crédito',
  description: 'Compras en cuotas y diferidas',
  logo: '/banco.svg',
  dateRelease: '2032-02-29',
  dateRevision: '2033-02-28',
};
const rows = Array.from({ length: 6 }, (_, index) =>
  index === 0
    ? row
    : {
        ...row,
        id: 'cta' + index,
        name: 'Cuenta ' + index,
      },
);

function httpError(status: number, error?: object) {
  return throwError(() => new HttpErrorResponse({ status, error }));
}

describe('Recorridos de productos', () => {
  let harness: RouterTestingHarness;
  let repository: jest.Mocked<ProductsRepository>;

  beforeEach(() => {
    repository = {
      list: jest.fn().mockReturnValue(of(rows)),
      get: jest.fn().mockReturnValue(of(row)),
      exists: jest.fn().mockReturnValue(of(false)),
      create: jest.fn().mockImplementation((product: Product) => {
        repository.list.mockReturnValue(of([...rows, product]));
        return of(product);
      }),
      update: jest.fn().mockReturnValue(of(undefined)),
      remove: jest.fn().mockImplementation((id: string) => {
        repository.list.mockReturnValue(of(rows.filter((product) => product.id !== id)));
        return of(undefined);
      }),
    };
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), { provide: PRODUCTS_REPOSITORY, useValue: repository }],
    });
  });

  async function open(url: string) {
    harness = await RouterTestingHarness.create(url);
  }

  async function settle() {
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  function element<T extends HTMLElement>(selector: string): T {
    const result = harness.routeNativeElement?.querySelector<T>(selector);
    if (!result) throw new Error('Missing element: ' + selector);
    return result;
  }

  function fill(id: string, value: string) {
    const field = element<HTMLInputElement>('#' + id);
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function blur(id: string) {
    element('#' + id).dispatchEvent(new Event('blur'));
  }

  function send() {
    element('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }

  function draft(name = 'Cuenta nueva') {
    fill('id', 'prueba01');
    fill('name', name);
    fill('description', 'Descripción de la cuenta nueva.');
    fill('logo', '/banco.svg');
    fill('dateRelease', row.dateRelease);
  }

  function selectDelete() {
    element('tbody .icon-button').click();
    harness.detectChanges();
    element('[role="menuitem"].danger-action').click();
    harness.detectChanges();
  }

  it('muestra carga, distingue el error y permite reintentar', async () => {
    const pending = new Subject<Product[]>();
    repository.list.mockReturnValueOnce(pending);
    await open('/productos');
    expect(element('.table-skeleton')).toBeTruthy();
    pending.error(new Error('sin conexión'));
    await settle();
    expect(element('[role="alert"]').textContent).toContain('No se pudieron cargar');
    element('.empty-state button').click();
    await settle();
    expect(element('.results').textContent).toContain('5 de 6');
    repository.list.mockReturnValueOnce(httpError(503));
    TestBed.inject(Catalog).refresh();
    await settle();
    expect(element('[role="alert"]').textContent).toContain('últimos datos');
    expect(element('tbody').children).toHaveLength(5);
  });

  it('busca, cambia tamaño y navega sin consultar de nuevo', async () => {
    await open('/productos');
    const next = [...element('nav').querySelectorAll('button')][1];
    next.click();
    await settle();
    expect(element('tbody').children).toHaveLength(1);
    const size = element<HTMLSelectElement>('select');
    size.value = '20';
    size.dispatchEvent(new Event('change'));
    await settle();
    expect(element('tbody').children).toHaveLength(6);
    fill('product-search', ' CREDITO ');
    await settle();
    expect(element('tbody').children).toHaveLength(1);
    expect(element('tbody').textContent).toContain(row.name);
    fill('product-search', 'zzz');
    await settle();
    expect(element('.empty-state').textContent).toContain('No encontramos coincidencias');
    element('.empty-state button').click();
    await settle();
    expect(element('tbody').children).toHaveLength(6);
    expect(repository.list).toHaveBeenCalledTimes(1);
  });

  it('abre el menú, permite moverse con teclas y navega al editor', async () => {
    await open('/productos?size=10');
    const trigger = element('tbody .icon-button');
    trigger.click();
    await settle();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const edit = element('[role="menuitem"]');
    edit.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement?.textContent).toContain('Eliminar');
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', bubbles: true }),
    );
    expect(document.activeElement).toBe(edit);
    edit.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.activeElement).toBe(trigger);
    trigger.click();
    await settle();
    edit.click();
    await settle();
    expect(TestBed.inject(Router).url).toContain('/productos/abc/editar?size=10');
    expect(element<HTMLInputElement>('#id').disabled).toBe(true);
  });

  it('cancela sin eliminar y luego ajusta la página tras confirmar', async () => {
    await open('/productos?page=2');
    selectDelete();
    expect(element('dialog').textContent).toContain('Cuenta 5');
    element('dialog button.secondary').click();
    expect(repository.remove).not.toHaveBeenCalled();
    selectDelete();
    element('dialog button.primary').click();
    await settle();
    expect(repository.remove).toHaveBeenCalledWith('cta5');
    expect(element('tbody').children).toHaveLength(5);
    expect(TestBed.inject(Router).url).toContain('page=1');
    expect(TestBed.inject(Notices).current()?.title).toBe('Producto eliminado correctamente');
  });

  it('consulta la eliminación incierta antes de permitir un nuevo intento', async () => {
    repository.remove.mockReturnValueOnce(httpError(0));
    repository.get.mockReturnValueOnce(httpError(503)).mockReturnValueOnce(of(row));
    await open('/productos');
    selectDelete();
    element('dialog button.primary').click();
    await settle();
    expect(element('dialog').textContent).toContain('No se pudo confirmar');
    expect(element('dialog button.primary').textContent).toContain('Consultar estado');
    element('dialog button.primary').click();
    await settle();
    expect(element('dialog').textContent).toContain('sigue en el catálogo');
    expect(repository.remove).toHaveBeenCalledTimes(1);
  });

  it('quita de la vista el producto eliminado aunque falle la recarga posterior', async () => {
    await open('/productos');
    repository.remove.mockReturnValueOnce(of(undefined));
    repository.list.mockReturnValueOnce(httpError(503));
    selectDelete();
    element('dialog button.primary').click();
    await settle();
    expect(element('[role="alert"]').textContent).toContain('últimos datos');
    expect(element('tbody').textContent).not.toContain(row.name);
    expect(TestBed.inject(Notices).current()?.title).toBe('Producto eliminado correctamente');
  });

  it.each([404, 400])('conserva la semántica del error %i al eliminar', async (status) => {
    repository.remove.mockReturnValueOnce(httpError(status));
    await open('/productos');
    selectDelete();
    element('dialog button.primary').click();
    await settle();
    if (status === 404) expect(TestBed.inject(Notices).current()?.kind).toBe('info');
    else expect(element('dialog [role="alert"]').textContent).toContain('No se pudo eliminar');
  });

  it('valida, calcula la revisión y crea con el ID verificado', async () => {
    await open('/productos/nuevo');
    send();
    await settle();
    expect(element('#id').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement?.id).toBe('id');
    expect(repository.create).not.toHaveBeenCalled();
    draft();
    expect(element<HTMLInputElement>('#dateRevision').value).toBe('2033-02-28');
    send();
    await settle();
    expect(repository.exists).toHaveBeenCalledWith('prueba01');
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'prueba01', dateRevision: '2033-02-28' }),
    );
    expect(TestBed.inject(Router).url).toContain('/productos');
    expect(element('tbody').textContent).toContain('Cuenta nueva');
  });

  it('descarta una verificación obsoleta y reintenta una fallida', async () => {
    const pending = new Subject<boolean>();
    repository.exists
      .mockReturnValueOnce(pending)
      .mockReturnValueOnce(httpError(503))
      .mockReturnValueOnce(of(true));
    await open('/productos/nuevo');
    fill('id', ' primer ');
    blur('id');
    expect(repository.exists).toHaveBeenCalledWith('primer');
    fill('id', 'segundo');
    pending.next(true);
    blur('id');
    await settle();
    expect(element('#id-error').textContent).toContain('No se pudo verificar');
    element('.field .text-button').click();
    await settle();
    expect(element('#id-error').textContent).toContain('ya está registrado');
    draft();
    element('.form-actions button.secondary').click();
    element('dialog button.primary').click();
    await settle();
    expect(element<HTMLInputElement>('#id').value).toBe('');
    expect(element<HTMLInputElement>('#dateRevision').value).toBe('');
  });

  it('conserva el nombre de cinco caracteres y muestra el rechazo de la API', async () => {
    repository.create.mockReturnValueOnce(
      httpError(400, { errors: [{ property: 'name', constraints: { minLength: '6' } }] }),
    );
    await open('/productos/nuevo');
    draft('Cinco');
    send();
    await settle();
    expect(element('#name-error').textContent).toContain('6 caracteres');
    expect(element<HTMLInputElement>('#name').value).toBe('Cinco');
    expect(element<HTMLInputElement>('#description').value).toBe('Descripción de la cuenta nueva.');
    fill('name', 'Cuenta corregida');
    await settle();
    expect(element('#name').getAttribute('aria-invalid')).toBe('false');
    send();
    await settle();
    expect(repository.create).toHaveBeenCalledTimes(2);
  });

  it('vuelve a validar los datos que cambian durante la verificación previa al envío', async () => {
    const pending = new Subject<boolean>();
    repository.exists.mockReturnValueOnce(pending);
    await open('/productos/nuevo');
    draft();
    send();
    fill('name', '');
    pending.next(false);
    pending.complete();
    await settle();
    expect(repository.create).not.toHaveBeenCalled();
    expect(element('#name').getAttribute('aria-invalid')).toBe('true');
  });

  it('descarta el envío de un ID anterior y procesa una sola vez el vigente', async () => {
    const first = new Subject<boolean>();
    const second = new Subject<boolean>();
    repository.exists.mockReturnValueOnce(first).mockReturnValueOnce(second);
    await open('/productos/nuevo');
    draft();
    send();
    fill('id', 'vigente');
    first.next(false);
    first.complete();
    expect(repository.create).not.toHaveBeenCalled();
    send();
    send();
    second.next(false);
    second.complete();
    await settle();
    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'vigente' }));
  });

  it('distingue fecha pasada, revisión calculada y logo inaccesible', async () => {
    await open('/productos/nuevo');
    draft();
    fill('dateRelease', '2020-01-01');
    fill('logo', ' /imagen.png ');
    blur('logo');
    await settle();
    element('.logo-preview').dispatchEvent(new Event('error'));
    send();
    await settle();
    expect(element('#dateRelease-error').textContent).toContain('posterior a hoy');
    expect(element('.form-content').textContent).toContain('No se pudo mostrar la vista previa');
    fill('dateRelease', today());
    await settle();
    expect(element('#dateRelease').getAttribute('aria-invalid')).toBe('false');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('precarga edición, restaura el original y guarda sin incluir ID', async () => {
    repository.get.mockReturnValueOnce(of({ ...row, dateRevision: row.dateRelease }));
    await open('/productos/abc/editar?q=tarjeta&size=10');
    expect(element<HTMLInputElement>('#id').disabled).toBe(true);
    expect(element('.feedback.info').textContent).toContain('Se recalculó');
    fill('name', 'Otro producto');
    element('.form-actions button.secondary').click();
    element('dialog button.primary').click();
    await settle();
    expect(element<HTMLInputElement>('#name').value).toBe(row.name);
    fill('name', 'Tarjeta nueva');
    send();
    await settle();
    expect(repository.update).toHaveBeenCalledWith(
      'abc',
      expect.objectContaining({ name: 'Tarjeta nueva' }),
    );
    expect(repository.update.mock.calls[0][1]).not.toHaveProperty('id');
    expect(repository.exists).not.toHaveBeenCalled();
    expect(TestBed.inject(Router).url).toBe('/productos?q=tarjeta&size=10');
  });

  it('diferencia edición inexistente de fallo recuperable', async () => {
    repository.get.mockReturnValueOnce(httpError(503)).mockReturnValueOnce(httpError(404));
    await open('/productos/abc/editar');
    expect(element('[role="alert"]').textContent).toContain('No se pudo cargar');
    element('.empty-state button').click();
    await settle();
    expect(element('[role="alert"]').textContent).toContain('ya no está disponible');
  });

  it('verifica una escritura incierta y confirma al encontrar los mismos datos', async () => {
    repository.create.mockImplementationOnce((product) => {
      repository.get.mockReturnValueOnce(httpError(503)).mockReturnValueOnce(of(product));
      return httpError(0);
    });
    await open('/productos/nuevo');
    draft();
    send();
    await settle();
    expect(element('[role="alert"]').textContent).toContain('No se pudo confirmar');
    expect(element<HTMLInputElement>('fieldset').disabled).toBe(true);
    element('.form-actions button.primary').click();
    await settle();
    expect(TestBed.inject(Notices).current()?.title).toBe('Producto registrado correctamente');
    expect(repository.create).toHaveBeenCalledTimes(1);
  });

  it('pide confirmación para salir con cambios y acepta permanecer', async () => {
    await open('/productos/nuevo');
    fill('name', 'Sin guardar');
    const router = TestBed.inject(Router);
    const cancelled = router.navigateByUrl('/productos');
    await new Promise((resolve) => setTimeout(resolve, 0));
    harness.detectChanges();
    element('dialog').dispatchEvent(new Event('cancel', { cancelable: true }));
    await expect(cancelled).resolves.toBe(false);
    expect(element<HTMLInputElement>('#name').value).toBe('Sin guardar');
    const accepted = router.navigateByUrl('/productos');
    await new Promise((resolve) => setTimeout(resolve, 0));
    harness.detectChanges();
    element('dialog button.primary').click();
    await expect(accepted).resolves.toBe(true);
  });

  it('redirige la raíz y ofrece regreso desde una ruta desconocida', async () => {
    await open('/');
    expect(TestBed.inject(Router).url).toBe('/productos');
    await harness.navigateByUrl('/desconocida');
    expect(element('h1').textContent).toContain('Página no encontrada');
    expect(element('a').getAttribute('href')).toBe('/productos');
  });

  it('da tiempo de lectura y cancela la salida anterior al mostrar otro aviso', () => {
    jest.useFakeTimers();
    try {
      const notices = TestBed.inject(Notices);
      notices.show('Producto registrado correctamente', 'Cuenta nueva');
      jest.advanceTimersByTime(4999);
      expect(notices.fading()).toBe(false);
      jest.advanceTimersByTime(1);
      expect(notices.fading()).toBe(true);
      expect(notices.current()?.detail).toBe('Cuenta nueva');

      notices.show('Cambios guardados correctamente', 'Cuenta actualizada');
      jest.advanceTimersByTime(300);
      expect(notices.current()?.detail).toBe('Cuenta actualizada');
      expect(notices.fading()).toBe(false);
      jest.advanceTimersByTime(4700);
      expect(notices.fading()).toBe(true);
      jest.advanceTimersByTime(300);
      expect(notices.current()).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('anuncia resultados incluso si cambia la pantalla', async () => {
    const app = TestBed.createComponent(App);
    const notices = TestBed.inject(Notices);
    notices.show('Producto registrado correctamente', 'Se agregó «Cuenta nueva» al catálogo.');
    await app.whenStable();
    expect(app.nativeElement.querySelector('[role="status"]').textContent).toContain(
      'Se agregó «Cuenta nueva» al catálogo.',
    );
  });
});
