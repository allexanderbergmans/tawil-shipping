const chalk = require("chalk");

function statusBadge(s) {
  const colors = {
    pending: chalk.yellow, in_transit: chalk.blue, cleared: chalk.green,
    delivered: chalk.green, delayed: chalk.red, exception: chalk.red, created: chalk.gray,
  };
  return (colors[s] || chalk.gray)(s || "unknown");
}

function resultBadge(r) {
  const colors = { pass: chalk.green, flag: chalk.yellow, fail: chalk.red };
  return (colors[r] || chalk.gray)(r);
}

function ruleActionBadge(a) {
  const colors = { block: chalk.red, flag: chalk.yellow, warn: chalk.gray };
  return (colors[a] || chalk.gray)(a);
}

function fmtDate(d) {
  if (!d) return chalk.gray("\u2014");
  try { return new Date(d + "Z").toLocaleString(); }
  catch { return d; }
}

function fmtCurrency(v) {
  if (!v) return chalk.gray("\u2014");
  return "$" + Number(v).toLocaleString();
}

function table(headers, rows) {
  const colWidths = headers.map((h, i) => {
    const maxData = rows.reduce((m, r) => Math.max(m, stripAnsi(String(r[i] || "")).length), 0);
    return Math.max(h.length, maxData);
  });

  const sep = " " + colWidths.map(w => "\u2500".repeat(w + 2)).join("\u2500") + " ";
  const line = (cells, bold) =>
    (bold ? "" : "") + " " + cells.map((c, i) => String(c).padEnd(colWidths[i] + (String(c).length - stripAnsi(String(c)).length))).join("  ") + "";

  const out = [];
  out.push(sep);
  out.push(line(headers.map(h => chalk.bold(h)), true));
  out.push(sep.replace(/\u2500/g, "\u2501"));
  for (const row of rows) out.push(line(row));
  out.push(sep);
  return out.join("\n");
}

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

module.exports = { statusBadge, resultBadge, ruleActionBadge, fmtDate, fmtCurrency, table };
