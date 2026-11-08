import { Routes } from '@angular/router';
import type { ProductForm } from './products/ui/product-form';

const loadForm = () => import('./products/ui/product-form').then((module) => module.ProductForm);
const leaveForm = (form: ProductForm) => form.canLeave();

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'productos' },
  {
    path: 'productos',
    title: 'Productos financieros | Banco',
    loadComponent: () => import('./products/ui/product-list').then((module) => module.ProductList),
  },
  {
    path: 'productos/nuevo',
    title: 'Agregar producto | Banco',
    loadComponent: loadForm,
    canDeactivate: [leaveForm],
  },
  {
    path: 'productos/:id/editar',
    title: 'Editar producto | Banco',
    loadComponent: loadForm,
    canDeactivate: [leaveForm],
  },
  {
    path: '**',
    title: 'Página no encontrada | Banco',
    loadComponent: () => import('./not-found').then((module) => module.NotFound),
  },
];
