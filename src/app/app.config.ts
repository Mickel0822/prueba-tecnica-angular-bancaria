import { provideHttpClient } from '@angular/common/http';
import { ApplicationConfig } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { PRODUCTS_REPOSITORY } from './products/application/products-repository';
import { HttpProductsRepository } from './products/data/products-api';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    { provide: PRODUCTS_REPOSITORY, useExisting: HttpProductsRepository },
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })),
  ],
};
