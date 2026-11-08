import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page-width empty-state">
      <span class="state-icon" aria-hidden="true">?</span>
      <h1 #heading tabindex="-1">Página no encontrada</h1>
      <p>La dirección no corresponde a una página del catálogo.</p>
      <a class="button primary" routerLink="/productos">Volver al listado</a>
    </section>
  `,
})
export class NotFound {
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');
  constructor() {
    afterNextRender(() => this.heading().nativeElement.focus());
  }
}
