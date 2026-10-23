import React from 'react';
import {
  CalendarCheck,
  Warehouse,
  Users,
  Boxes,
  ShoppingCart,
  Network,
  Package,
  LayoutGrid,
} from 'lucide-react';

const icons = new Map<string, typeof LayoutGrid>([
  ['lucide:calendar-check', CalendarCheck],
  ['lucide:warehouse', Warehouse],
  ['lucide:users', Users],
  ['lucide:boxes', Boxes],
  ['lucide:shopping-cart', ShoppingCart],
  ['lucide:network', Network],
  ['lucide:package', Package],
  ['lucide:layout-grid', LayoutGrid],
]);

export function BusinessDomainIcon({ name }: { name: string }) {
  const Icon = icons.get(name) ?? LayoutGrid;
  return <Icon className="gea-shell-nav-icon" aria-hidden="true" size={18} />;
}
