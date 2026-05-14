import styles from "./ChatStreamingSkeleton.module.css";

export function ChatStreamingSkeleton() {
  return (
    <s-stack direction="block" gap="small">
      <div className={styles.bar} style={{ width: "92%" }} />
      <div className={styles.bar} style={{ width: "78%" }} />
      <div className={styles.bar} style={{ width: "64%" }} />
    </s-stack>
  );
}
