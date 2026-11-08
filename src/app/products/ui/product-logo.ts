import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { imageSource } from '../domain/product';

@Component({
  selector: 'app-product-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (source(); as url) {
      <img
        [src]="url"
        alt=""
        width="48"
        height="48"
        loading="lazy"
        referrerpolicy="no-referrer"
        (error)="failed.set(url)"
      />
    } @else {
      <span aria-hidden="true">{{ initials() }}</span>
    }
  `,
  styles: `
    :host {
      display: inline-grid;
      place-items: center;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: #eaf0f7;
      color: #2c4775;
      font-size: 0.78rem;
      font-weight: 700;
      overflow: hidden;
    }
    img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
  `,
})
export class ProductLogo {
  readonly logo = input.required<string>();
  readonly name = input.required<string>();
  readonly failed = signal<string | null>(null);
  readonly source = computed(() => {
    const url = imageSource(this.logo());
    return this.failed() === url ? null : url;
  });
  readonly initials = computed(() => {
    const words = this.name().trim().split(/\s+/);
    const meaningful = words.filter(
      (word) => !['de', 'del', 'la', 'el', 'y'].includes(word.toLowerCase()),
    );
    return (meaningful.length ? meaningful : words)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase();
  });
}
