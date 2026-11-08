import {
  afterNextRender,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, ValidatorFn } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, Subscription } from 'rxjs';
import { Notices } from '../application/catalog';
import {
  fieldRejection,
  PRODUCTS_REPOSITORY,
  statusOf,
  uncertainWrite,
} from '../data/products-api';
import {
  imageSource,
  Product,
  ProductDetails,
  releaseError,
  revisionDate,
  textError,
  textLimits,
  today,
} from '../domain/product';
import { DecisionDialog } from './decision-dialog';

type Field = keyof Product;
type Verification = 'idle' | 'pending' | 'available' | 'duplicate' | 'unavailable';
const empty: Product = {
  id: '',
  name: '',
  description: '',
  logo: '',
  dateRelease: '',
  dateRevision: '',
};
const messageValidator =
  (validate: (value: string) => string | null): ValidatorFn =>
  (control) => {
    const message = validate(control.value);
    return message ? { message } : null;
  };

function sameProduct(left: Product, right: Product): boolean {
  return (Object.keys(empty) as Field[]).every((field) => left[field] === right[field]);
}

@Component({
  selector: 'app-product-form',
  imports: [ReactiveFormsModule, RouterLink, DecisionDialog],
  templateUrl: './product-form.html',
  styleUrl: './product-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'beforeUnload($event)' },
})
export class ProductForm {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly repository = inject(PRODUCTS_REPOSITORY);
  private readonly notices = inject(Notices);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');
  private readonly leaveDialog = viewChild.required(DecisionDialog);
  private verificationRequest?: Subscription;
  private loadRequest?: Subscription;
  private checkedId = '';
  private original = empty;
  private lastSubmission?: Product;
  private leaveRequest?: { promise: Promise<boolean>; resolve: (leave: boolean) => void };
  protected readonly editingId = signal<string | null>(null);
  protected readonly loadState = signal<'ready' | 'loading' | 'missing' | 'error'>('ready');
  protected readonly saving = signal(false);
  protected readonly checkingSave = signal(false);
  protected readonly needsSaveCheck = signal(false);
  protected readonly verification = signal<Verification>('idle');
  protected readonly attempted = signal(false);
  protected readonly saveError = signal('');
  protected readonly remote = signal<{ field: 'id' | 'name'; message: string } | null>(null);
  protected readonly recalculated = signal(false);
  protected readonly preview = signal('');
  protected readonly previewFailed = signal(false);
  protected readonly minimumDate = today();
  protected readonly fields = [
    {
      key: 'id',
      label: 'ID',
      hint: 'De 3 a 10 caracteres. Ejemplo: trj-crd',
      placeholder: 'trj-crd',
    },
    {
      key: 'name',
      label: 'Nombre',
      hint: 'De 5 a 100 caracteres.',
      placeholder: 'Tarjeta de crédito',
    },
    {
      key: 'description',
      label: 'Descripción',
      hint: 'De 10 a 200 caracteres.',
      placeholder: 'Describe el producto',
    },
    {
      key: 'logo',
      label: 'Logo',
      hint: 'URL o ruta de la imagen del producto.',
      placeholder: 'https://…',
    },
  ] as const;
  private readonly release = this.fb.control('', messageValidator(releaseError));
  protected readonly form = this.fb.group({
    id: ['', messageValidator((value) => textError(value, textLimits.id))],
    name: ['', messageValidator((value) => textError(value, textLimits.name))],
    description: ['', messageValidator((value) => textError(value, textLimits.description))],
    logo: ['', messageValidator((value) => textError(value, textLimits.logo))],
    dateRelease: this.release,
    dateRevision: [
      '',
      messageValidator((value) =>
        value && value === revisionDate(this.release.value)
          ? null
          : 'La revisión debe ser un año posterior a la liberación.',
      ),
    ],
  });

  constructor() {
    this.form.events.pipe(takeUntilDestroyed()).subscribe(() => this.changeDetector.markForCheck());
    this.form.controls.dateRelease.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.form.controls.dateRevision.setValue(revisionDate(value));
      this.recalculated.set(false);
    });
    this.form.controls.id.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.clearVerification());
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      const rejected = this.remote();
      if (
        rejected &&
        this.form.controls[rejected.field].value !== this.lastSubmission?.[rejected.field]
      )
        this.remote.set(null);
      if (
        this.lastSubmission &&
        !sameProduct(this.form.getRawValue(), this.lastSubmission) &&
        !this.needsSaveCheck()
      ) {
        this.saveError.set('');
      }
    });
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.editingId.set(params.get('id'));
      this.load();
    });
    afterNextRender(() => this.heading().nativeElement.focus());
  }

  protected load(): void {
    this.loadRequest?.unsubscribe();
    const id = this.editingId();
    if (id === null) {
      this.form.controls.id.enable();
      this.original = empty;
      this.reset();
      this.loadState.set('ready');
      return;
    }
    this.loadState.set('loading');
    this.form.controls.id.disable();
    this.loadRequest = this.repository
      .get(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (product) => {
          const revision = revisionDate(product.dateRelease);
          this.original = { ...product, dateRevision: revision };
          this.reset();
          this.recalculated.set(product.dateRevision !== revision);
          this.loadState.set('ready');
        },
        error: (error: unknown) =>
          this.loadState.set(statusOf(error) === 404 ? 'missing' : 'error'),
      });
  }

  protected blur(field: 'id' | 'name' | 'description' | 'logo'): void {
    const control = this.form.controls[field];
    const trimmed = control.value.trim();
    if (trimmed !== control.value) control.setValue(trimmed);
    if (field === 'id') this.verify();
    if (field === 'logo') this.updatePreview(trimmed);
  }

  private clearVerification(): void {
    this.verificationRequest?.unsubscribe();
    this.checkedId = '';
    this.verification.set('idle');
  }

  protected verify(onAvailable?: () => void): void {
    const control = this.form.controls.id;
    if (control.disabled || control.invalid || this.verification() === 'pending') return;
    const id = control.value.trim();
    if (id === this.checkedId && this.verification() === 'available') {
      return;
    }
    if (id === this.checkedId && this.verification() === 'duplicate') return;
    this.verification.set('pending');
    this.checkedId = id;
    this.verificationRequest = this.repository
      .exists(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (exists) => {
          this.verification.set(exists ? 'duplicate' : 'available');
          if (!exists) onAvailable?.();
        },
        error: () => this.verification.set('unavailable'),
      });
  }

  protected errorFor(field: Field): string {
    const control = this.form.controls[field];
    const remote = this.remote();
    if (remote?.field === field) return remote.message;
    if (field === 'id' && this.verification() === 'duplicate') return 'Este ID ya está registrado.';
    if (field === 'id' && this.verification() === 'unavailable')
      return 'No se pudo verificar el ID.';
    if (!control.touched && !this.attempted()) return '';
    if (field === 'dateRevision' && this.form.controls.dateRelease.invalid) return '';
    const message: string = control.errors?.['message'] ?? '';
    return field === 'id' && message ? `¡ID no válido! ${message}` : message;
  }

  protected describedBy(field: Field): string {
    return this.errorFor(field) ? `${field}-hint ${field}-error` : `${field}-hint`;
  }

  protected reset(): void {
    this.clearVerification();
    this.form.reset(this.original);
    this.attempted.set(false);
    this.remote.set(null);
    this.saveError.set('');
    this.needsSaveCheck.set(false);
    this.lastSubmission = undefined;
    this.updatePreview(this.original.logo);
  }

  private updatePreview(value: string): void {
    this.preview.set(value);
    this.previewFailed.set(false);
  }

  protected logoSource(): string | null {
    return this.previewFailed() ? null : imageSource(this.preview());
  }

  protected submit(): void {
    if (
      this.leaveRequest ||
      this.saving() ||
      this.checkingSave() ||
      this.verification() === 'pending'
    )
      return;
    if (this.needsSaveCheck() && this.lastSubmission) {
      this.checkSave(this.lastSubmission);
      return;
    }
    this.attempted.set(true);
    this.form.markAllAsTouched();
    this.form.controls.dateRelease.updateValueAndValidity();
    if (this.form.invalid || this.remote() || this.verification() === 'duplicate') {
      this.focusError();
      return;
    }
    const verified =
      this.checkedId === this.form.controls.id.value.trim() && this.verification() === 'available';
    if (this.editingId() !== null || verified) this.save();
    else this.verify(() => this.submit());
  }

  private focusError(): void {
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      {
        injector: this.injector,
      },
    );
  }

  private save(): void {
    const raw = this.form.getRawValue();
    const id = this.editingId() ?? raw.id.trim();
    const details: ProductDetails = {
      name: raw.name.trim(),
      description: raw.description.trim(),
      logo: raw.logo.trim(),
      dateRelease: raw.dateRelease,
      dateRevision: raw.dateRevision,
    };
    const product = { id, ...details };
    this.lastSubmission = product;
    this.saving.set(true);
    this.saveError.set('');
    const request: Observable<unknown> =
      this.editingId() !== null
        ? this.repository.update(id, details)
        : this.repository.create(product);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.saved(id),
      error: (error: unknown) => {
        this.saving.set(false);
        const rejection = fieldRejection(error);
        if (rejection) {
          this.remote.set(rejection);
          this.focusError();
        } else if (statusOf(error) === 404 && this.editingId() !== null) {
          this.saveError.set('El producto ya no está disponible. Puedes volver al listado.');
        } else if (uncertainWrite(error)) {
          this.checkSave(product);
        } else {
          this.saveError.set('No se pudo guardar. Revisa los datos e intenta nuevamente.');
        }
      },
    });
  }

  private checkSave(product: Product): void {
    this.checkingSave.set(true);
    this.repository
      .get(product.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (current) => {
          this.checkingSave.set(false);
          if (sameProduct(current, product)) this.saved(product.id);
          else {
            this.needsSaveCheck.set(false);
            if (this.editingId() === null)
              this.remote.set({ field: 'id', message: 'Este ID ya está registrado.' });
            this.saveError.set(
              'Los cambios no coinciden con el producto actual. Revisa los datos antes de reintentar.',
            );
          }
        },
        error: (error: unknown) => {
          this.checkingSave.set(false);
          this.needsSaveCheck.set(statusOf(error) !== 404);
          this.saveError.set(
            this.needsSaveCheck()
              ? 'No se pudo confirmar el guardado. Consulta el estado antes de reintentar.'
              : 'No se encontró el producto al consultar el estado. Puedes revisar los datos e intentar nuevamente.',
          );
        },
      });
  }

  private saved(id: string): void {
    this.saving.set(false);
    this.needsSaveCheck.set(false);
    this.form.markAsPristine();
    const editing = this.editingId() !== null;
    this.notices.show(editing ? 'Cambios guardados.' : 'Producto agregado.');
    const params = this.route.snapshot.queryParams;
    void this.router.navigate(['/productos'], {
      queryParams: editing ? params : { size: params['size'] ?? null },
      state: editing ? undefined : { createdId: id },
    });
  }

  canLeave(): boolean | Promise<boolean> {
    if (this.saving() || this.checkingSave()) return false;
    if (!this.form.dirty) return true;
    if (this.leaveRequest) return this.leaveRequest.promise;
    if (this.verification() === 'pending') this.clearVerification();
    let resolve!: (leave: boolean) => void;
    const promise = new Promise<boolean>((done) => {
      resolve = done;
    });
    this.leaveRequest = { promise, resolve };
    this.leaveDialog().show();
    return promise;
  }

  protected resolveLeave(leave: boolean): void {
    this.leaveDialog().close();
    this.leaveRequest?.resolve(leave);
    this.leaveRequest = undefined;
  }

  protected beforeUnload(event: BeforeUnloadEvent): void {
    if (this.form.dirty || this.saving() || this.checkingSave()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
}
