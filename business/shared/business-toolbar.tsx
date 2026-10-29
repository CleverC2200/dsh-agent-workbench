import React, { useEffect, useState, type ReactNode } from 'react';
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
  const [shared, setShared] = useState(false);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source === window.parent && event.data?.protocol === 'gea-toolbar-layout')
        setShared(event.data.shared === true);
    };
    window.addEventListener('message', receive);
    window.parent.postMessage({ protocol: 'gea-toolbar-layout-ready' }, '*');
    return () => {
      window.removeEventListener('message', receive);
      window.parent.postMessage({ protocol: 'gea-toolbar-layout-gone' }, '*');
    };
  }, []);
  return (
    <header className={`${styles.header} ${className}`} data-business-toolbar>
      <div className={`${styles.row} ${shared ? styles.sharedRow : ''}`} data-business-toolbar-row>
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
