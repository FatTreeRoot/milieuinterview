import React from "react";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

/**
 * PDF export.
 *
 * Both documents are stored as markdown that HR can edit, so this renders that
 * markdown rather than the original data: what they see in the editor is what
 * they get in the file.
 *
 * Colours follow the Milieu style guide. Gold and salmon are decorative only,
 * so they appear in the brand rule and nowhere else.
 */

const BRAND = {
  navy: "#0b1b34",
  blue: "#3d7cc0",
  gold: "#f5cc24",
  salmon: "#e08561",
  muted: "#4f5a72",
  subtle: "#6d778e",
  border: "#e2e5ea",
  sunken: "#f7f8fa",
  favourable: "#1c7f56",
  unfavourable: "#c0392b",
  warn: "#b7791f",
  warnBg: "#fdf6e3",
  warnBorder: "#e8d08a",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 64,
    paddingHorizontal: 52,
    fontSize: 10.5,
    lineHeight: 1.6,
    color: BRAND.navy,
    fontFamily: "Helvetica",
  },
  h1: { fontSize: 19, fontFamily: "Helvetica-Bold", marginBottom: 8 },
  h2: { fontSize: 12.5, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 5 },
  paragraph: { marginBottom: 7 },
  meta: { fontSize: 10, color: BRAND.muted, marginBottom: 2 },
  metaLabel: { fontFamily: "Helvetica-Bold", color: BRAND.navy },
  emphasis: { color: BRAND.muted, fontFamily: "Helvetica-Oblique" },
  bullet: { flexDirection: "row", marginBottom: 4, paddingRight: 8 },
  bulletDot: { width: 12, color: BRAND.blue },
  rule: { flexDirection: "row", height: 3, width: 72, marginBottom: 18 },
  divider: { borderBottomWidth: 1, borderBottomColor: BRAND.border, marginVertical: 14 },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: BRAND.warnBorder,
    backgroundColor: BRAND.warnBg,
    color: BRAND.warn,
    paddingVertical: 7,
    paddingHorizontal: 11,
    marginBottom: 8,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 52,
    right: 52,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: BRAND.subtle,
    borderTopWidth: 1,
    borderTopColor: BRAND.border,
    paddingTop: 7,
  },
});

/** The four-bar brand rule: salmon, gold, blue, navy, in that order. */
function BrandRule() {
  const bars = [BRAND.salmon, BRAND.gold, BRAND.blue, BRAND.navy];
  return (
    <View style={styles.rule}>
      {bars.map((colour, index) => (
        <View
          key={colour}
          style={{
            flex: 1,
            backgroundColor: colour,
            marginRight: index === bars.length - 1 ? 0 : 3,
            borderRadius: 1.5,
          }}
        />
      ))}
    </View>
  );
}

/** Splits `**bold**` and `*italic*` runs out of a line of markdown. */
function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(
        <Text key={`${keyPrefix}-b${index}`} style={{ fontFamily: "Helvetica-Bold" }}>
          {token.slice(2, -2)}
        </Text>,
      );
    } else {
      parts.push(
        <Text key={`${keyPrefix}-i${index}`} style={styles.emphasis}>
          {token.slice(1, -1)}
        </Text>,
      );
    }
    last = match.index + token.length;
    index += 1;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length > 0 ? parts : [text];
}

function renderMarkdown(markdown: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const lines = markdown.split("\n");

  lines.forEach((raw, index) => {
    const line = raw.trimEnd();
    const key = `line-${index}`;

    if (!line.trim()) return;

    if (line === "---") {
      nodes.push(<View key={key} style={styles.divider} />);
      return;
    }
    if (line.startsWith("# ")) {
      nodes.push(
        <View key={key} wrap={false}>
          <Text style={styles.h1}>{line.slice(2)}</Text>
          <BrandRule />
        </View>,
      );
      return;
    }
    if (line.startsWith("## ")) {
      nodes.push(
        <Text key={key} style={styles.h2}>
          {line.slice(3)}
        </Text>,
      );
      return;
    }
    if (line.startsWith("> ")) {
      nodes.push(
        <View key={key} style={styles.quote}>
          <Text>{inline(line.slice(2), key)}</Text>
        </View>,
      );
      return;
    }
    if (line.startsWith("- ")) {
      nodes.push(
        <View key={key} style={styles.bullet}>
          <Text style={styles.bulletDot}>{"•"}</Text>
          <Text style={{ flex: 1 }}>{inline(line.slice(2), key)}</Text>
        </View>,
      );
      return;
    }

    // "**Label:** value" metadata lines read better tighter than body copy.
    const meta = line.match(/^\*\*(.+?):\*\*\s*(.*)$/);
    if (meta) {
      nodes.push(
        <Text key={key} style={styles.meta}>
          <Text style={styles.metaLabel}>{meta[1]}: </Text>
          {meta[2]}
        </Text>,
      );
      return;
    }

    nodes.push(
      <Text key={key} style={styles.paragraph}>
        {inline(line, key)}
      </Text>,
    );
  });

  return nodes;
}

function PdfDocument({ markdown, footer }: { markdown: string; footer: string }) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {renderMarkdown(markdown)}
        <View style={styles.footer} fixed>
          <Text>{footer}</Text>
          <Text
            render={({ pageNumber, totalPages }) => `${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

export async function renderPdf(markdown: string, footer: string): Promise<Buffer> {
  return renderToBuffer(<PdfDocument markdown={markdown} footer={footer} />);
}
