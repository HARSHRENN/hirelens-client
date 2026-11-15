export function Mark({ size = 26 }: { size?: number }) {
  return <svg className="wordmark-mark" width={size} height={size} viewBox="0 0 26 26" aria-hidden>
    <rect x="0" y="0" width="16" height="26" rx="5" fill="var(--color-ink)" />
    <circle cx="8" cy="9" r="4" fill="var(--color-paper)" />
    <rect x="18" y="0" width="8" height="12" rx="3" fill="var(--blue-500)" />
    <rect x="18" y="14" width="8" height="12" rx="3" fill="var(--color-accent)" />
  </svg>
}
