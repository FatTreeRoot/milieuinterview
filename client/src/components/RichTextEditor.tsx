import { useCallback, useEffect, useRef, useState } from "react";
import { htmlToMarkdown, markdownToHtml } from "../lib/markdown";

/**
 * Rich text editor for the interview document and the evaluation report.
 *
 * Editing is WYSIWYG, but the value handed back is markdown, which is what the
 * documents are stored and rendered as. Keeping storage in markdown means the
 * PDF export reads exactly what was edited, with no second format to keep in
 * step.
 *
 * The editable area is only initialised from `value` once. Rewriting its HTML
 * on every keystroke would move the caret to the start on every character.
 */

type Command = {
  label: string;
  title: string;
  icon: React.ReactNode;
  run: () => void;
  isActive?: () => boolean;
};

function Icon({ path, filled = false }: { path: string; filled?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

export function RichTextEditor({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (markdown: string) => void;
  ariaLabel: string;
}) {
  const editor = useRef<HTMLDivElement>(null);
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (editor.current) editor.current.innerHTML = markdownToHtml(value);
    // Only on mount, and when the document being edited changes identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = useCallback(() => {
    if (editor.current) onChange(htmlToMarkdown(editor.current));
  }, [onChange]);

  const exec = useCallback(
    (command: string, argument?: string) => {
      editor.current?.focus();
      document.execCommand(command, false, argument);
      emit();
      forceRender((n) => n + 1);
    },
    [emit],
  );

  const active = (command: string) => {
    try {
      return document.queryCommandState(command);
    } catch {
      return false;
    }
  };

  const inBlock = (tag: string) => {
    const selection = window.getSelection();
    let node = selection?.anchorNode ?? null;
    while (node && node !== editor.current) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === tag) {
        return true;
      }
      node = node.parentNode;
    }
    return false;
  };

  const commands: Command[] = [
    {
      label: "Bold",
      title: "Bold (Ctrl+B)",
      icon: <Icon path="M7 5h6.5a3.5 3.5 0 0 1 0 7H7zM7 12h7.5a3.5 3.5 0 0 1 0 7H7z" />,
      run: () => exec("bold"),
      isActive: () => active("bold"),
    },
    {
      label: "Italic",
      title: "Italic (Ctrl+I)",
      icon: <Icon path="M15 5h-5M14 19H9M14.5 5l-4 14" />,
      run: () => exec("italic"),
      isActive: () => active("italic"),
    },
    {
      label: "Heading",
      title: "Heading",
      icon: <Icon path="M6 5v14M18 5v14M6 12h12" />,
      run: () => exec("formatBlock", inBlock("H2") ? "p" : "h2"),
      isActive: () => inBlock("H2"),
    },
    {
      label: "Bulleted list",
      title: "Bulleted list",
      icon: <Icon path="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
      run: () => exec("insertUnorderedList"),
      isActive: () => active("insertUnorderedList"),
    },
    {
      label: "Quote",
      title: "Callout",
      icon: <Icon path="M6 5v14M10 8h9M10 12h9M10 16h5" />,
      run: () => exec("formatBlock", inBlock("BLOCKQUOTE") ? "p" : "blockquote"),
      isActive: () => inBlock("BLOCKQUOTE"),
    },
  ];

  return (
    <div className="editor">
      <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
        {commands.map((command) => (
          <button
            key={command.label}
            type="button"
            className="editor-tool"
            aria-label={command.label}
            aria-pressed={command.isActive?.() ?? false}
            title={command.title}
            // Keeps the selection: a click would otherwise blur the editor
            // before the command runs, and the command would have no target.
            onMouseDown={(event) => event.preventDefault()}
            onClick={command.run}
          >
            {command.icon}
          </button>
        ))}
      </div>

      <div
        ref={editor}
        className="editor-surface doc-view"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        onInput={emit}
        onBlur={emit}
        // Selection changes do not fire input, but the toolbar state depends
        // on where the caret is.
        onKeyUp={() => forceRender((n) => n + 1)}
        onMouseUp={() => forceRender((n) => n + 1)}
        // Paste is forced to plain text. Nothing from a clipboard becomes
        // markup, so pasting from Word cannot drag styling or scripts in.
        onPaste={(event) => {
          event.preventDefault();
          const text = event.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
        }}
      />
    </div>
  );
}
