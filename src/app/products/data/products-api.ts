import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { map, Observable } from 'rxjs';
import { isCalendarDate, Product, ProductDetails } from '../domain/product';

export interface ProductsRepository {
  list(): Observable<Product[]>;
  get(id: string): Observable<Product>;
  exists(id: string): Observable<boolean>;
  create(product: Product): Observable<Product>;
  update(id: string, details: ProductDetails): Observable<void>;
  remove(id: string): Observable<void>;
}

export const PRODUCTS_API_BASE = new InjectionToken<string>('Products API base', {
  providedIn: 'root',
  factory: () => '/bp',
});

export const PRODUCTS_REPOSITORY = new InjectionToken<ProductsRepository>('Products repository', {
  providedIn: 'root',
  factory: () => inject(HttpProductsRepository),
});

const timeout = 10_000;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid API response');
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid product field');
  return value;
}

function calendar(value: unknown): string {
  const result = text(value).split('T')[0];
  if (!isCalendarDate(result)) throw new Error('Invalid product date');
  return result;
}

function productOf(value: unknown): Product {
  const dto = object(value);
  return {
    id: text(dto['id']),
    name: text(dto['name']),
    description: text(dto['description']),
    logo: text(dto['logo']),
    dateRelease: calendar(dto['date_release']),
    dateRevision: calendar(dto['date_revision']),
  };
}

function bodyOf(details: ProductDetails) {
  return {
    name: details.name,
    description: details.description,
    logo: details.logo,
    date_release: details.dateRelease,
    date_revision: details.dateRevision,
  };
}

@Injectable({ providedIn: 'root' })
export class HttpProductsRepository implements ProductsRepository {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(PRODUCTS_API_BASE)}/products`;

  list(): Observable<Product[]> {
    return this.http.get<unknown>(this.url, { timeout }).pipe(
      map((response) => {
        const data = object(response)['data'];
        if (!Array.isArray(data)) throw new Error('Invalid product collection');
        return data.map(productOf);
      }),
    );
  }

  get(id: string): Observable<Product> {
    return this.http.get<unknown>(this.item(id), { timeout }).pipe(map(productOf));
  }

  exists(id: string): Observable<boolean> {
    return this.http
      .get<unknown>(`${this.url}/verification/${encodeURIComponent(id)}`, { timeout })
      .pipe(
        map((exists) => {
          if (typeof exists !== 'boolean') throw new Error('Invalid verification response');
          return exists;
        }),
      );
  }

  create(product: Product): Observable<Product> {
    return this.http
      .post<unknown>(this.url, { id: product.id, ...bodyOf(product) }, { timeout })
      .pipe(map((response) => productOf(object(response)['data'])));
  }

  update(id: string, details: ProductDetails): Observable<void> {
    return this.http.put(this.item(id), bodyOf(details), { timeout }).pipe(map(() => undefined));
  }

  remove(id: string): Observable<void> {
    return this.http.delete(this.item(id), { timeout }).pipe(map(() => undefined));
  }

  private item(id: string): string {
    return `${this.url}/${encodeURIComponent(id)}`;
  }
}

export function statusOf(error: unknown): number | undefined {
  return error instanceof HttpErrorResponse ? error.status : undefined;
}

export function uncertainWrite(error: unknown): boolean {
  const status = statusOf(error);
  return status === undefined || status === 0 || status === 408 || status >= 500 || status === 200;
}

export function fieldRejection(error: unknown): { field: 'id' | 'name'; message: string } | null {
  if (!(error instanceof HttpErrorResponse) || error.status !== 400) return null;
  const body = error.error;
  if (typeof body?.message === 'string' && /duplicate identifier/i.test(body.message)) {
    return { field: 'id', message: 'Este ID ya está registrado.' };
  }
  if (
    Array.isArray(body?.errors) &&
    body.errors.some(
      (entry: { property?: string; constraints?: { minLength?: string } } | null) =>
        entry?.property === 'name' && entry.constraints?.minLength,
    )
  ) {
    return { field: 'name', message: 'Ingresa al menos 6 caracteres para guardar este nombre.' };
  }
  return null;
}
