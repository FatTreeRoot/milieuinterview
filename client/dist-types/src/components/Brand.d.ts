/**
 * The Milieu lockup: the rings, then "Milieu" over the product name.
 *
 * Both lines are live text in the interface's own colours rather than part of
 * the image, so they invert correctly in dark mode, stay crisp at any size,
 * and are readable to a screen reader. The image contributes the rings and is
 * marked decorative; the wrapper carries the accessible name.
 */
export declare function Lockup({ height, to, }: {
    height?: number;
    to?: string | null;
}): import("react").JSX.Element;
/**
 * The SNRGY attribution. Milieu owns the header, SNRGY owns one line of the
 * footer: small, subtle, and never competing with Milieu.
 */
export declare function PoweredBy(): import("react").JSX.Element;
