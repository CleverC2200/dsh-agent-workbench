import React, { type ReactNode } from 'react';
import styles from './business-toolbar.module.css';

export function BusinessToolbar({
  filters,
  actions,
  navigation,
  className = '',
}: {
  filters: ReactNode;
  actions: ReactNode;
  navigation?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`${styles.header} ${className}`} data-business-toolbar>
      <div className={styles.row} data-business-toolbar-row>
        <div className={styles.filters} data-business-toolbar-filters>
          {filters}
        </div>
        <div className={styles.actions} data-business-toolbar-actions>
          {actions}
        </div>
      </div>
      {navigation && (
        <div className={styles.navigation} data-business-toolbar-navigation>
          {navigation}
        </div>
      )}
    </header>
  );
}
