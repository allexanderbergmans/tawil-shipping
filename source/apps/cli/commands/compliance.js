const compliance = require("@global-logistics/compliance-engine");
const { resultBadge, ruleActionBadge, fmtDate, table } = require("../lib/format");

async function runCheck(id) {
  console.log(`\n  Running compliance checks on \x1b[90m${id}\x1b[0m...`);
  const result = compliance.runChecks(id);
  console.log(`  Passed: \x1b[32m${result.passed ? "YES" : "NO"}\x1b[0m`);
  console.log(`  Failures: ${result.failures.length}, Flags: ${result.flags.length}\n`);
}

async function results(id) {
  const r = compliance.getResults(id);
  if (r.length === 0) { console.log("\n  No compliance checks found.\n"); return; }
  console.log("\n" + table(["Result", "Rule", "Details", "Checked"],
    r.map(c => [
      resultBadge(c.result),
      c.rule_type || c.rule_id?.slice(0, 12) || "",
      (c.details || "").slice(0, 50),
      fmtDate(c.checked_at),
    ])
  ) + "\n");
}

async function rules(opts) {
  const r = compliance.getRules(opts.type);
  if (r.length === 0) { console.log("\n  No rules found.\n"); return; }
  console.log("\n" + table(["Type", "Country", "Action", "Description"],
    r.map(rr => [rr.type, rr.country || "—", ruleActionBadge(rr.action), rr.description])
  ) + "\n");
}

module.exports = { runCheck, results, rules };
