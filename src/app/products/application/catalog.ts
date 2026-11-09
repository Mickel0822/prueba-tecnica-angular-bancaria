import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { finalize, Subscription } from 'rxjs';
import { Product } from '../domain/product';
import { PRODUCTS_REPOSITORY } from './products-repository';

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
  private readonly notice = signal<{
    title: string;
    detail: string;
    kind: 'success' | 'info';
  } | null>(null);
  private readonly leaving = signal(false);
  private timer?: ReturnType<typeof setTimeout>;
  readonly current = this.notice.asReadonly();
  readonly fading = this.leaving.asReadonly();

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  show(title: string, detail: string, kind: 'success' | 'info' = 'success'): void {
    clearTimeout(this.timer);
    this.leaving.set(false);
    this.notice.set({ title, detail, kind });
    this.timer = setTimeout(() => {
      this.leaving.set(true);
      this.timer = setTimeout(() => {
        this.notice.set(null);
        this.leaving.set(false);
      }, 300);
    }, 5000);
  }
}
