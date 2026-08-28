import { useEffect, type ReactNode } from "react";
import { formatScore } from "@milieu/shared";
import { useTheme } from "../lib/theme";

/**
 * Theme toggle.
 *
 * The icon shows the theme you would switch to, drawn in the current text
 * colour: the style guide reserves gold and salmon for decoration and forbids
 * them on anything that has to be read. The button carries a label for screen
 * readers, since the glyph alone is not a name.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const goingDark = theme === "light";
  const label = goingDark ? "Switch to dark theme" : "Switch to light theme";

  return (
    <button
      type="button"
      className={`btn btn--secondary icon-btn ${className}`}
      onClick={toggle}
      aria-label={label}
      title={label}
    >
      {goingDark ? (
        // Moon
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      ) : (
        // Sun
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
        </svg>
      )}
    </button>
  );
}

/**
 * The four-bar brand rule: salmon, gold, blue, navy, in that order. It sits
 * under a page title and replaces a plain divider.
 */
export function BrandRule() {
  return (
    <div className="brand-rule" aria-hidden="true">
      <span style={{ background: "var(--color-brand-salmon)" }} />
      <span style={{ background: "var(--color-brand-gold)" }} />
      <span style={{ background: "var(--color-brand-blue)" }} />
      <span style={{ background: "var(--color-brand-navy)" }} />
    </div>
  );
}

export function PageHead({
  title,
  lede,
  actions,
}: {
  title: string;
  lede?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div className="row-between">
        <h1>{title}</h1>
        {actions ? <div className="row">{actions}</div> : null}
      </div>
      <BrandRule />
      {lede ? <div className="lede">{lede}</div> : null}
    </div>
  );
}

/**
 * Outcome badge. The label carries the meaning and colour only reinforces it,
 * so it still reads in greyscale.
 */
export function OutcomeBadge({
  passed,
  borderline,
  score,
}: {
  passed: boolean | null;
  borderline: boolean | null;
  score?: number | null;
}) {
  if (passed === null) {
    return <span className="badge badge--neutral">Not evaluated</span>;
  }
  const label = passed ? "Above threshold" : "Below threshold";
  return (
    <span className="row" style={{ gap: 6 }}>
      <span className={`badge ${passed ? "badge--pass" : "badge--fail"}`}>
        {label}
      </span>
      {borderline ? (
        <span className="badge badge--borderline">Borderline</span>
      ) : null}
      {score !== null && score !== undefined ? (
        <span className="score">{formatScore(score)}</span>
      ) : null}
    </span>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && !error ? <span className="hint">{hint}</span> : null}
      {error ? <span className="field-error">{error}</span> : null}
    </div>
  );
}

export function Alert({ children }: { children: ReactNode }) {
  return (
    <div className="alert" role="alert">
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row-between" style={{ marginBottom: 14 }}>
          <h2>{title}</h2>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onClose}
            aria-label="Close"
          >
            Close
          </button>
        </div>
        {children}
        {footer ? (
          <div className="row" style={{ marginTop: 18, justifyContent: "flex-end" }}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ConfirmButton({
  onConfirm,
  label,
  confirmLabel = "Confirm",
  title,
  body,
  className = "btn btn--destructive btn--sm",
  open,
  setOpen,
}: {
  onConfirm: () => void;
  label: string;
  confirmLabel?: string;
  title: string;
  body: ReactNode;
  className?: string;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open ? (
        <Modal
          title={title}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--destructive btn--sm"
                onClick={() => {
                  setOpen(false);
                  onConfirm();
                }}
              >
                {confirmLabel}
              </button>
            </>
          }
        >
          {body}
        </Modal>
      ) : null}
    </>
  );
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDuration(seconds: number): string {
  if (!seconds) return "";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
