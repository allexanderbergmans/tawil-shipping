function render(metadata, blocks) {
  let md = "";

  for (const [k, v] of Object.entries(metadata)) {
    md += `<!-- ${k}: ${v} -->\n`;
  }
  if (Object.keys(metadata).length > 0) md += "\n";

  for (const block of blocks) {
    switch (block.type) {
      case "heading":
        md += `${"#".repeat(block.level)} ${block.text}\n\n`;
        break;
      case "paragraph":
        md += `${renderInline(block.text)}\n\n`;
        break;
      case "table": {
        if (block.rows.length === 0) break;
        md += block.rows[0].map(c => `| ${c} `).join("") + "|\n";
        md += block.rows[0].map(() => "| --- ").join("") + "|\n";
        for (let r = 1; r < block.rows.length; r++) {
          md += block.rows[r].map(c => `| ${c} `).join("") + "|\n";
        }
        md += "\n";
        break;
      }
      case "code":
        md += "```" + (block.lang || "") + "\n" + block.code + "\n```\n\n";
        break;
      case "blockquote":
        md += block.text.split("\n").map(l => `> ${l}`).join("\n") + "\n\n";
        break;
      case "divider":
        md += "---\n\n";
        break;
    }
  }

  return md.trim();
}

function renderInline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "**$1**")
    .replace(/\*(.+?)\*/g, "*$1*")
    .replace(/`(.+?)`/g, "`$1`");
}

module.exports = { render };
