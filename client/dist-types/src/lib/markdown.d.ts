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
export declare function markdownToHtml(markdown: string): string;
export declare function htmlToMarkdown(root: HTMLElement): string;
