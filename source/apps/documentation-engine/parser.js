function parse(source) {
  const doc = {
    metadata: {},
    blocks: [],
  };

  const lines = source.split("\n");
  let i = 0;

  while (i < lines.length && lines[i].trim() === "") i++;

  if (i < lines.length && lines[i].trim() === "---") {
    i++;
    while (i < lines.length && lines[i].trim() !== "---") {
      const match = lines[i].match(/^(\w+)\s*:\s*(.+)$/);
      if (match) doc.metadata[match[1]] = match[2].trim();
      i++;
    }
    i++;
  }

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "") { i++; continue; }

    if (trimmed.startsWith("@table")) {
      i++;
      const rows = [];
      while (i < lines.length && lines[i].trim() !== "@endtable") {
        const row = lines[i].trim();
        if (row.startsWith("|") && row.endsWith("|")) {
          const cells = row.split("|").slice(1, -1).map(c => c.trim());
          rows.push(cells);
        }
        i++;
      }
      i++;
      doc.blocks.push({ type: "table", rows });
      continue;
    }

    if (trimmed.startsWith("@code") || trimmed.startsWith("@codeblock")) {
      const lang = trimmed.replace(/^@code(block)?\s*/, "");
      i++;
      const code = [];
      while (i < lines.length && lines[i].trim() !== "@endcode") {
        code.push(lines[i]);
        i++;
      }
      i++;
      doc.blocks.push({ type: "code", lang: lang || "text", code: code.join("\n") });
      continue;
    }

    if (trimmed.startsWith("###")) {
      doc.blocks.push({ type: "heading", level: 3, text: trimmed.replace("###", "").trim() });
      i++;
      continue;
    }
    if (trimmed.startsWith("##")) {
      doc.blocks.push({ type: "heading", level: 2, text: trimmed.replace("##", "").trim() });
      i++;
      continue;
    }
    if (trimmed.startsWith("#")) {
      doc.blocks.push({ type: "heading", level: 1, text: trimmed.replace("#", "").trim() });
      i++;
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      doc.blocks.push({ type: "blockquote", text: quoteLines.join("\n") });
      continue;
    }

    if (trimmed.startsWith("---") || trimmed.startsWith("***")) {
      doc.blocks.push({ type: "divider" });
      i++;
      continue;
    }

    const paraLines = [];
    while (i < lines.length && lines[i].trim() !== "" &&
           !lines[i].trim().startsWith("@") &&
           !lines[i].trim().startsWith("#") &&
           !lines[i].trim().startsWith(">") &&
           !lines[i].trim().startsWith("---") &&
           !lines[i].trim().startsWith("***")) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      doc.blocks.push({ type: "paragraph", text: paraLines.join("\n") });
    }
  }

  return doc;
}

module.exports = { parse };
