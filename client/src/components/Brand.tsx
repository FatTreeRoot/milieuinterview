import { Link } from "react-router-dom";

/**
 * The Milieu lockup: the rings, then "Milieu" over the product name.
 *
 * Both lines are live text in the interface's own colours rather than part of
 * the image, so they invert correctly in dark mode, stay crisp at any size,
 * and are readable to a screen reader. The image contributes the rings and is
 * marked decorative; the wrapper carries the accessible name.
 */
export function Lockup({
  height = 40,
  to = "/",
}: {
  height?: number;
  to?: string | null;
}) {
  const content = (
    <>
      <img
        src="/milieu-rings.png"
        alt=""
        height={height}
        width={Math.round(height * 1.086)}
        style={{ display: "block" }}
      />
      <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
        <span
          className="wordmark"
          style={{ fontSize: Math.round(height * 0.52) }}
        >
          Milieu
        </span>
        <span
          style={{
            fontSize: Math.round(height * 0.36),
            color: "var(--color-text-muted)",
            fontWeight: 400,
            letterSpacing: "-0.01em",
          }}
        >
          Interviews
        </span>
      </span>
    </>
  );

  const props = {
    className: "lockup",
    role: "img",
    "aria-label": "Milieu Interviews",
  } as const;

  return to ? (
    <Link to={to} {...props} style={{ textDecoration: "none" }}>
      {content}
    </Link>
  ) : (
    <div {...props}>{content}</div>
  );
}

/**
 * The SNRGY attribution. Milieu owns the header, SNRGY owns one line of the
 * footer: small, subtle, and never competing with Milieu.
 */
export function PoweredBy() {
  return (
    <span className="powered-by">
      <img src="/snrgy-mark.png" alt="" width={14} height={14} />
      Powered by SNRGY
    </span>
  );
}
