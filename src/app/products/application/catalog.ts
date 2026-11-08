import { inject, Injectable, signal } from '@angular/core';
import { finalize, Subscription } from 'rxjs';
import { PRODUCTS_REPOSITORY } from '../data/products-api';
import { Product } from '../domain/product';

@Injectable({ providedIn: 'root' })
export class Catalog {
  private readonly repository = inject(PRODUCTS_REPOSITORY);
  private request?: Subscription;
  readonly products = signal<readonly Product[] | null>(null);
  readonly loading = signal(false);
  readonly failed = signal(false);

  forget(id: string): void {
    this.products.update((products) => products?.filter((product) => product.id !== id) ?? null);
  }

  refresh(onLoaded?: (products: readonly Product[]) => void): void {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.failed.set(false);
    this.request = this.repository
      .list()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (products) => {
          this.products.set(products);
          onLoaded?.(products);
        },
        error: () => this.failed.set(true),
      });
  }
}

@Injectable({ providedIn: 'root' })
export class Notices {
  readonly message = signal('');
  private timer?: ReturnType<typeof setTimeout>;

  show(message: string): void {
    clearTimeout(this.timer);
    this.message.set(message);
    this.timer = setTimeout(() => this.message.set(''), 6000);
  }
}
