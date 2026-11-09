import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { Product, ProductDetails } from '../domain/product';

export interface ProductsRepository {
  list(): Observable<Product[]>;
  get(id: string): Observable<Product>;
  exists(id: string): Observable<boolean>;
  create(product: Product): Observable<Product>;
  update(id: string, details: ProductDetails): Observable<void>;
  remove(id: string): Observable<void>;
}

export const PRODUCTS_REPOSITORY = new InjectionToken<ProductsRepository>('Products repository');
