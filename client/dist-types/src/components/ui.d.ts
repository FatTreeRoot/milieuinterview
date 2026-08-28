import { type ReactNode } from "react";
/**
 * Theme toggle.
 *
 * The icon shows the theme you would switch to, drawn in the current text
 * colour: the style guide reserves gold and salmon for decoration and forbids
 * them on anything that has to be read. The button carries a label for screen
 * readers, since the glyph alone is not a name.
 */
export declare function ThemeToggle({ className }: {
    className?: string;
}): import("react").JSX.Element;
/**
 * The four-bar brand rule: salmon, gold, blue, navy, in that order. It sits
 * under a page title and replaces a plain divider.
 */
export declare function BrandRule(): import("react").JSX.Element;
export declare function PageHead({ title, lede, actions, }: {
    title: string;
    lede?: ReactNode;
    actions?: ReactNode;
}): import("react").JSX.Element;
/**
 * Outcome badge. The label carries the meaning and colour only reinforces it,
 * so it still reads in greyscale.
 */
export declare function OutcomeBadge({ passed, borderline, score, }: {
    passed: boolean | null;
    borderline: boolean | null;
    score?: number | null;
}): import("react").JSX.Element;
export declare function Field({ label, hint, error, children, }: {
    label: string;
    hint?: string;
    error?: string | undefined;
    children: ReactNode;
}): import("react").JSX.Element;
export declare function Alert({ children }: {
    children: ReactNode;
}): import("react").JSX.Element;
export declare function Empty({ children }: {
    children: ReactNode;
}): import("react").JSX.Element;
export declare function Modal({ title, onClose, children, footer, }: {
    title: string;
    onClose: () => void;
    children: ReactNode;
    footer?: ReactNode;
}): import("react").JSX.Element;
export declare function ConfirmButton({ onConfirm, label, confirmLabel, title, body, className, open, setOpen, }: {
    onConfirm: () => void;
    label: string;
    confirmLabel?: string;
    title: string;
    body: ReactNode;
    className?: string;
    open: boolean;
    setOpen: (open: boolean) => void;
}): import("react").JSX.Element;
export declare function formatDate(iso: string): string;
export declare function formatDuration(seconds: number): string;
