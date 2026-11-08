import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';

@Component({
  selector: 'app-decision-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog
      #dialog
      aria-labelledby="dialog-title"
      aria-describedby="dialog-detail"
      (cancel)="escape($event)"
    >
      <h2 id="dialog-title">{{ heading() }}</h2>
      <p id="dialog-detail">{{ detail() }}</p>
      @if (error()) {
        <p class="feedback error" role="alert">{{ error() }}</p>
      }
      <div class="dialog-actions">
        <button
          class="button secondary"
          type="button"
          autofocus
          [disabled]="busy()"
          (click)="cancelled.emit()"
        >
          Cancelar
        </button>
        <button class="button primary" type="button" [disabled]="busy()" (click)="confirmed.emit()">
          @if (busy()) {
            <span class="spinner" aria-hidden="true"></span>
          }
          {{ busy() ? busyLabel() : confirmLabel() }}
        </button>
      </div>
    </dialog>
  `,
  styles: `
    dialog {
      width: min(35rem, calc(100% - 2rem));
      max-height: calc(100% - 2rem);
      border: 0;
      border-radius: 12px;
      padding: clamp(1.25rem, 5vw, 2rem);
      color: var(--ink);
      box-shadow: 0 18px 70px #101d3a35;
    }
    dialog::backdrop {
      background: #101d3a70;
    }
    h2 {
      margin: 0;
      font-size: 1.45rem;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }
    p {
      margin: 0.85rem 0 0;
      overflow-wrap: anywhere;
      color: var(--muted);
    }
    .dialog-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.75rem;
      margin-top: 2rem;
    }
  `,
})
export class DecisionDialog {
  readonly heading = input.required<string>();
  readonly detail = input.required<string>();
  readonly confirmLabel = input.required<string>();
  readonly busy = input(false);
  readonly busyLabel = input('Procesando…');
  readonly error = input('');
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  show(): void {
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  escape(event: Event): void {
    event.preventDefault();
    if (!this.busy()) this.cancelled.emit();
  }
}
