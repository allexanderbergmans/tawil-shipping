function render(metadata, blocks) {
  let html = "<!DOCTYPE html><html><head><meta charset='UTF-8'>";
  if (metadata.title) html += `<title>${escapeHtml(metadata.title)}</title>`;
  html += "<style>body{font-family:sans-serif;max-width:800px;margin:2em auto;padding:0 1em;line-height:1.6}" +
    "table{border-collapse:collapse;width:100%;margin:1em 0}" +
    "th,td{border:1px solid #ccc;padding:8px;text-align:left}" +
    "th{background:#f5f5f5}code{background:#f0f0f0;padding:2px 6px;border-radius:3px}" +
    "pre code{display:block;padding:1em;overflow-x:auto}" +
    "blockquote{border-left:4px solid #ddd;margin:1em 0;padding:0.5em 1em;color:#666}" +
    ".meta{color:#888;font-size:0.9em;margin-bottom:2em}</style></head><body>";

  const metaHtml = Object.entries(metadata).map(([k, v]) =>
    `<span class='meta'><strong>${k}:</strong> ${escapeHtml(v)}</span> `
  ).join("");
  if (metaHtml) html += `<div class='meta'>${metaHtml}</div>`;

  for (const block of blocks) {
    switch (block.type) {
      case "heading":
        html += `<h${block.level}>${escapeHtml(block.text)}</h${block.level}>`;
        break;
      case "paragraph":
        html += `<p>${renderInline(block.text)}</p>`;
        break;
      case "table": {
        html += "<table>";
        if (block.rows.length > 0) {
          html += "<thead><tr>" + block.rows[0].map(c => `<th>${escapeHtml(c)}</th>`).join("") + "</tr></thead>";
          html += "<tbody>";
          for (let r = 1; r < block.rows.length; r++) {
            html += "<tr>" + block.rows[r].map(c => `<td>${escapeHtml(c)}</td>`).join("") + "</tr>";
          }
          html += "</tbody>";
        }
        html += "</table>";
        break;
      }
      case "code":
        html += `<pre><code class='lang-${escapeHtml(block.lang)}'>${escapeHtml(block.code)}</code></pre>`;
        break;
      case "blockquote":
        html += `<blockquote>${renderInline(block.text)}</blockquote>`;
        break;
      case "divider":
        html += "<hr>";
        break;
    }
  }

  html += "</body></html>";
  return html;
}

function renderInline(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/{{(.+?)}}/g, "<span class='variable'>{{$1}}</span>")
    .replace(/\n/g, "<br>");
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

module.exports = { render };
