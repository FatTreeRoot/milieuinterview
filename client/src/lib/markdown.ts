/**
 * Conversion between the markdown the documents are stored as and the HTML the
 * editor works in.
 *
 * Storage stays markdown on purpose: the PDF renderer reads it, and it stays
 * readable and diffable. The editor is a view over it, not a new format.
 *
 * Nothing here ever trusts HTML from outside. Going in, the markdown is
 * escaped and the tags are ones we emit ourselves. Coming out, the DOM is
 * walked and only known elements are recognised; anything else contributes its
 * text and nothing more. Paste is forced to plain text in the editor itself.
 */

const BLOCK_TAGS = new Set(["H1", "H2", "H3", "P", "DIV", "BLOCKQUOTE", "LI", "HR", "UL", "OL"]);

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Bold and italic runs, on already-escaped text. */
function inlineToHtml(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
}

/**
 * These documents are line oriented: the PDF renderer emits one block per
 * line, and the header's consecutive "**Label:** value" lines are meant to
 * stay separate rather than collapsing into one paragraph the way ordinary
 * markdown would. The viewer and the editor follow the same rule so all three
 * agree on what a document looks like.
 *
 * Editing normalises the blank lines between blocks. That changes the stored
 * text but never what it renders as, because blank lines only ever separate
 * blocks here.
 */
export function markdownToHtml(markdown: string): string {
  const out: string[] = [];
  const lines = markdown.split("\n");
  let bullets: string[] = [];

  const flushBullets = () => {
    if (bullets.length === 0) return;
    out.push(`<ul>${bullets.map((b) => `<li>${inlineToHtml(b)}</li>`).join("")}</ul>`);
    bullets = [];
  };
  const flushAll = flushBullets;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushAll();
      continue;
    }
    if (line === "---") {
      flushAll();
      out.push("<hr>");
      continue;
    }
    if (line.startsWith("## ")) {
      flushAll();
      out.push(`<h2>${inlineToHtml(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith("# ")) {
      flushAll();
      out.push(`<h1>${inlineToHtml(line.slice(2))}</h1>`);
      continue;
    }
    if (line.startsWith("> ")) {
      flushAll();
      out.push(`<blockquote>${inlineToHtml(line.slice(2))}</blockquote>`);
      continue;
    }
    if (line.startsWith("- ")) {
      bullets.push(line.slice(2));
      continue;
    }
    flushBullets();
    out.push(`<p>${inlineToHtml(line)}</p>`);
  }
  flushAll();

  // An empty document still needs somewhere to put the cursor.
  return out.join("") || "<p><br></p>";
}

/** Inline formatting of a node's children, as markdown. */
function inlineToMarkdown(node: Node): string {
  let out = "";
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      out += child.textContent ?? "";
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const element = child as HTMLElement;
    const inner = inlineToMarkdown(element);

    switch (element.tagName) {
      case "STRONG":
      case "B":
        out += inner.trim() ? `**${inner.trim()}**` : "";
        break;
      case "EM":
      case "I":
        out += inner.trim() ? `*${inner.trim()}*` : "";
        break;
      case "BR":
        out += " ";
        break;
      default:
        // Anything we do not model contributes its text only.
        out += inner;
    }
  });
  return out;
}

function blockToMarkdown(element: HTMLElement, out: string[]): void {
  const text = () => inlineToMarkdown(element).replace(/\s+/g, " ").trim();

  switch (element.tagName) {
    case "H1":
      if (text()) out.push(`# ${text()}`, "");
      break;
    case "H2":
    case "H3":
      if (text()) out.push(`## ${text()}`, "");
      break;
    case "HR":
      out.push("---", "");
      break;
    case "BLOCKQUOTE":
      if (text()) out.push(`> ${text()}`, "");
      break;
    case "UL":
    case "OL":
      element.querySelectorAll(":scope > li").forEach((li) => {
        const item = inlineToMarkdown(li).replace(/\s+/g, " ").trim();
        if (item) out.push(`- ${item}`);
      });
      out.push("");
      break;
    case "LI":
      if (text()) out.push(`- ${text()}`);
      break;
    default: {
      // A div or p that only wraps other blocks is a container, not a
      // paragraph: recurse rather than flattening its children into one line.
      const hasBlockChildren = Array.from(element.children).some((c) =>
        BLOCK_TAGS.has(c.tagName),
      );
      if (hasBlockChildren) {
        Array.from(element.children).forEach((child) =>
          blockToMarkdown(child as HTMLElement, out),
        );
      } else if (text()) {
        out.push(text(), "");
      }
    }
  }
}

export function htmlToMarkdown(root: HTMLElement): string {
  const out: string[] = [];
  Array.from(root.children).forEach((child) =>
    blockToMarkdown(child as HTMLElement, out),
  );
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .concat("\n");
}
