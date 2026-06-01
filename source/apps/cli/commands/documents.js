const fs = require("fs");
const docEngine = require("@global-logistics/documentation-engine");

async function compile(file, opts) {
  if (!fs.existsSync(file)) { console.error(`\n  File not found: ${file}\n`); return; }
  const source = fs.readFileSync(file, "utf-8");
  const result = docEngine.compile(source, opts.format);
  console.log(`\n  Compiled \x1b[90m${file}\x1b[0m → ${opts.format} (${result.output.length} chars)\n`);
  if (opts.format === "markdown") {
    console.log(result.output);
  } else {
    const outPath = file.replace(/\.[^.]+$/, "") + "." + (opts.format === "markdown" ? "md" : "html");
    fs.writeFileSync(outPath, result.output);
    console.log(`  Written to \x1b[32m${outPath}\x1b[0m\n`);
  }
}

async function create(shipmentId, file, opts) {
  if (!fs.existsSync(file)) { console.error(`\n  File not found: ${file}\n`); return; }
  const source = fs.readFileSync(file, "utf-8");
  try {
    const doc = docEngine.compileAndSave(shipmentId, opts.type, file, source, opts.format);
    console.log(`\n  Document saved: \x1b[32m${doc.id}\x1b[0m\n`);
  } catch (e) {
    console.error(`\n  \x1b[31mError:\x1b[0m ${e.message}\n`);
  }
}

module.exports = { compile, create };
