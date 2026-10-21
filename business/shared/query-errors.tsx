import styles from './restored-workbench.module.css';

/** Keep actionable query failures available without repeating full source messages above the cards. */
export function QueryErrors({ errors }: { errors: readonly string[] }) {
  const messages = [...new Set(errors.filter(Boolean))];
  if (!messages.length) return null;
  return (
    <details className={styles.queryErrors} role="alert">
      <summary>数据读取异常（{messages.length}项）</summary>
      <ul>
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </details>
  );
}
