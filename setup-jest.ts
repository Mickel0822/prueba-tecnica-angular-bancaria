import { setupZonelessTestEnv } from 'jest-preset-angular/setup-env/zoneless';
setupZonelessTestEnv();

Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: {
    value(this: HTMLDialogElement) {
      this.open = true;
    },
  },
  close: {
    value(this: HTMLDialogElement) {
      this.open = false;
    },
  },
});

Object.defineProperties(HTMLElement.prototype, {
  scrollIntoView: { value: jest.fn() },
  showPopover: {
    value(this: HTMLElement) {
      this.dataset['popoverOpen'] = 'true';
    },
  },
  hidePopover: {
    value(this: HTMLElement) {
      delete this.dataset['popoverOpen'];
    },
  },
});
const nativeMatches = Element.prototype.matches;
Element.prototype.matches = function (selector: string) {
  return selector === ':popover-open'
    ? this.hasAttribute('data-popover-open')
    : nativeMatches.call(this, selector);
};
