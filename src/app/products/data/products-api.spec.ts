import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { fieldRejection, PRODUCTS_REPOSITORY, statusOf, uncertainWrite } from './products-api';

const dto = {
  id: 'ab/c',
  name: 'Tarjeta de crédito',
  description: 'Compras diferidas',
  logo: '/banco.svg',
  date_release: '2028-02-29',
  date_revision: '2029-02-28',
};
const { date_release, date_revision, ...fields } = dto;
const product = { ...fields, dateRelease: date_release, dateRevision: date_revision };

describe('Adaptador HTTP de productos', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }),
  );
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lee el listado y preserva el día de calendario', async () => {
    const result = firstValueFrom(TestBed.inject(PRODUCTS_REPOSITORY).list());
    const request = TestBed.inject(HttpTestingController).expectOne({
      method: 'GET',
      url: '/bp/products',
    });
    request.flush({ data: [{ ...dto, date_release: date_release + 'T00:00:00.000Z' }] });
    await expect(result).resolves.toEqual([product]);
  });

  it('consulta un ID codificado y verifica su existencia', async () => {
    const api = TestBed.inject(PRODUCTS_REPOSITORY);
    const http = TestBed.inject(HttpTestingController);
    const found = firstValueFrom(api.get(product.id));
    http.expectOne('/bp/products/ab%2Fc').flush(dto);
    await expect(found).resolves.toEqual(product);
    const exists = firstValueFrom(api.exists(product.id));
    http.expectOne('/bp/products/verification/ab%2Fc').flush(true);
    await expect(exists).resolves.toBe(true);
  });

  it('crea, actualiza sin ID en el cuerpo y elimina', async () => {
    const api = TestBed.inject(PRODUCTS_REPOSITORY);
    const http = TestBed.inject(HttpTestingController);
    const created = firstValueFrom(api.create(product));
    const post = http.expectOne({ method: 'POST', url: '/bp/products' });
    expect(post.request.body).toEqual(dto);
    post.flush({ data: dto });
    await expect(created).resolves.toEqual(product);
    const updated = firstValueFrom(api.update(product.id, product));
    const put = http.expectOne({ method: 'PUT', url: '/bp/products/ab%2Fc' });
    expect(put.request.body).not.toHaveProperty('id');
    expect(put.request.body).toHaveProperty('date_release', date_release);
    put.flush({ data: put.request.body });
    await expect(updated).resolves.toBeUndefined();
    const removed = firstValueFrom(api.remove(product.id));
    http.expectOne({ method: 'DELETE', url: '/bp/products/ab%2Fc' }).flush({});
    await expect(removed).resolves.toBeUndefined();
  });

  it.each([
    null,
    { data: 'incorrecto' },
    { data: [{ ...dto, id: 8 }] },
    { data: [{ ...dto, date_release: '2027-02-29' }] },
  ])('rechaza un listado incompatible', async (payload) => {
    const result = firstValueFrom(TestBed.inject(PRODUCTS_REPOSITORY).list());
    TestBed.inject(HttpTestingController).expectOne('/bp/products').flush(payload);
    await expect(result).rejects.toBeInstanceOf(Error);
  });

  it('rechaza una verificación que no devuelve un booleano', async () => {
    const result = firstValueFrom(TestBed.inject(PRODUCTS_REPOSITORY).exists('abc'));
    TestBed.inject(HttpTestingController).expectOne('/bp/products/verification/abc').flush('false');
    await expect(result).rejects.toThrow('Invalid verification');
  });

  it('traduce errores de campos y diferencia resultados inciertos', () => {
    const http = (status: number, error?: object) => new HttpErrorResponse({ status, error });
    expect(
      fieldRejection(http(400, { message: 'Duplicate identifier found in the database' })),
    ).toHaveProperty('field', 'id');
    expect(
      fieldRejection(
        http(400, { errors: [{ property: 'name', constraints: { minLength: '6' } }] }),
      ),
    ).toHaveProperty('field', 'name');
    expect(fieldRejection(http(400, { errors: [null, { property: 'logo' }] }))).toBeNull();
    expect(fieldRejection(http(404))).toBeNull();
    expect(fieldRejection(new Error())).toBeNull();
    expect(statusOf(http(404))).toBe(404);
    expect(
      [undefined, 0, 408, 500, 200, 400].map((status) =>
        uncertainWrite(status === undefined ? new Error() : http(status)),
      ),
    ).toEqual([true, true, true, true, true, false]);
  });
});
