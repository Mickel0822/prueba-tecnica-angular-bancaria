import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Catalog, Notices } from '../application/catalog';
import { PRODUCTS_REPOSITORY, statusOf, uncertainWrite } from '../data/products-api';
import {
  displayDate,
  filterProducts,
  pageNumber,
  pageSize,
  paginate,
  Product,
} from '../domain/product';
import { DecisionDialog } from './decision-dialog';
import { ProductLogo } from './product-logo';

@Component({
  selector: 'app-product-list',
  imports: [RouterLink, ProductLogo, DecisionDialog],
  templateUrl: './product-list.html',
  styleUrl: './product-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:resize)': 'closeMenu()', '(window:scroll)': 'closeMenu()' },
})
export class ProductList {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly repository = inject(PRODUCTS_REPOSITORY);
  private readonly notices = inject(Notices);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly parameters = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  private readonly createdId: string | undefined =
    this.router.currentNavigation()?.extras.state?.['createdId'];
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');
  private readonly addButton = viewChild.required<ElementRef<HTMLAnchorElement>>('addButton');
  private readonly menu = viewChild.required<ElementRef<HTMLElement>>('menu');
  private readonly dialog = viewChild.required(DecisionDialog);
  private trigger: HTMLButtonElement | null = null;

  protected readonly catalog = inject(Catalog);
  protected readonly query = computed(() => this.parameters().get('q') ?? '');
  protected readonly size = computed(() => pageSize(this.parameters().get('size')));
  protected readonly listing = computed(() =>
    paginate(
      filterProducts(this.catalog.products() ?? [], this.query()),
      pageNumber(this.parameters().get('page')),
      this.size(),
    ),
  );
  protected readonly skeletonRows = computed(() => Array.from({ length: this.size() }));
  protected readonly active = signal<Product | null>(null);
  protected readonly selected = signal<Product | null>(null);
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal('');
  protected readonly checkingDelete = signal(false);
  protected readonly needsDeleteCheck = signal(false);
  protected readonly displayDate = displayDate;

  constructor() {
    this.catalog.refresh((products) => {
      if (this.destroyRef.destroyed) return;
      if (!this.createdId) {
        this.clampPage();
        return;
      }
      const index = products.findIndex((product) => product.id === this.createdId);
      if (index >= 0)
        this.changeParams({ q: null, page: Math.floor(index / this.size()) + 1 }, true);
    });
    afterNextRender(() => this.heading().nativeElement.focus());
  }

  protected search(value: string): void {
    this.closeMenu();
    this.changeParams({ q: value || null, page: null }, true);
  }

  protected resize(value: string): void {
    this.closeMenu();
    this.changeParams({ size: pageSize(value), page: null });
  }

  protected go(page: number): void {
    this.closeMenu();
    this.changeParams({ page });
  }

  protected reload(): void {
    this.catalog.refresh(() => this.clampPage());
  }

  private clampPage(): void {
    if (this.destroyRef.destroyed) return;
    const requested = pageNumber(this.parameters().get('page'));
    if (requested > this.listing().page) this.changeParams({ page: this.listing().page }, true);
  }

  private changeParams(
    queryParams: Record<string, string | number | null>,
    replaceUrl = false,
  ): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl,
    });
  }

  protected toggleMenu(product: Product, trigger: HTMLButtonElement): void {
    if (this.active()?.id === product.id) {
      this.closeMenu(true);
      return;
    }
    this.closeMenu();
    this.trigger = trigger;
    const menu = this.menu().nativeElement;
    const rect = trigger.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(rect.right - 160, window.innerWidth - 168))}px`;
    if (rect.bottom + 104 > window.innerHeight) {
      menu.style.bottom = `${window.innerHeight - rect.top + 5}px`;
      menu.style.top = 'auto';
    } else {
      menu.style.top = `${rect.bottom + 5}px`;
      menu.style.bottom = 'auto';
    }
    this.active.set(product);
    menu.showPopover();
    menu.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }

  protected closeMenu(restore = false): void {
    if (!this.active()) return;
    const menu = this.menu().nativeElement;
    if (menu.matches(':popover-open')) menu.hidePopover();
    this.active.set(null);
    if (restore) this.trigger?.focus();
  }

  protected menuToggled(event: ToggleEvent): void {
    if (event.newState === 'closed' && !this.menu().nativeElement.matches(':popover-open'))
      this.active.set(null);
  }

  protected menuKey(event: KeyboardEvent): void {
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') event.preventDefault();
      this.closeMenu(true);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(
      this.menu().nativeElement.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    );
    const current = items.findIndex((item) => item === event.target);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }

  protected edit(): void {
    const product = this.active();
    if (!product) return;
    this.closeMenu();
    void this.router.navigate(['/productos', product.id, 'editar'], {
      queryParamsHandling: 'preserve',
    });
  }

  protected askDelete(): void {
    const product = this.active();
    if (!product) return;
    this.closeMenu(true);
    this.selected.set(product);
    this.deleteError.set('');
    this.needsDeleteCheck.set(false);
    this.dialog().show();
  }

  protected cancelDelete(): void {
    this.dialog().close();
    this.selected.set(null);
    this.trigger?.focus();
  }

  protected deleteOrCheck(): void {
    const product = this.selected();
    if (!product || this.deleting() || this.checkingDelete()) return;
    if (this.needsDeleteCheck()) {
      this.checkDeletion(product.id);
      return;
    }
    this.deleting.set(true);
    this.deleteError.set('');
    this.repository
      .remove(product.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.deleted('Producto eliminado.'),
        error: (error: unknown) => {
          this.deleting.set(false);
          if (statusOf(error) === 404) this.deleted('El producto ya no está disponible.');
          else if (uncertainWrite(error)) this.checkDeletion(product.id);
          else this.deleteError.set('No se pudo eliminar el producto. Puedes reintentar.');
        },
      });
  }

  private checkDeletion(id: string): void {
    this.checkingDelete.set(true);
    this.repository
      .get(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.checkingDelete.set(false);
          this.needsDeleteCheck.set(false);
          this.deleteError.set('El producto sigue en el catálogo. Puedes reintentar.');
        },
        error: (error: unknown) => {
          this.checkingDelete.set(false);
          if (statusOf(error) === 404) this.deleted('Producto eliminado.');
          else {
            this.needsDeleteCheck.set(true);
            this.deleteError.set(
              'No se pudo confirmar la eliminación. Consulta el estado antes de reintentar.',
            );
          }
        },
      });
  }

  private deleted(message: string): void {
    this.deleting.set(false);
    this.dialog().close();
    const product = this.selected();
    if (product) this.catalog.forget(product.id);
    this.selected.set(null);
    this.notices.show(message);
    this.reload();
    afterNextRender(() => this.addButton().nativeElement.focus(), { injector: this.injector });
  }
}
