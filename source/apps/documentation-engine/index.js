const { parse } = require("./parser");
const htmlCompiler = require("./compilers/html");
const mdCompiler = require("./compilers/markdown");
const { document } = require("@global-logistics/core/models");

function compile(source, format = "html") {
  const doc = parse(source);
  const compiler = format === "markdown" ? mdCompiler : htmlCompiler;
  return {
    metadata: doc.metadata,
    blocks: doc.blocks,
    output: compiler.render(doc.metadata, doc.blocks),
  };
}

function compileAndSave(shipmentId, type, title, source, format = "html") {
  const result = compile(source, format);
  return document.create({
    shipment_id: shipmentId,
    type,
    title,
    source_content: source,
    compiled_content: result.output,
    format,
  });
}

module.exports = { compile, compileAndSave, parse };
