#!/usr/bin/env node
const { Command } = require("commander");

require("@global-logistics/notification-engine").start();

const program = new Command();

program
  .name("glm")
  .description("Global Logistics Mesh — CLI for managing the supply chain")
  .version("1.0.0");

program
  .command("overview")
  .description("Show supply chain overview")
  .action(() => require("../commands/overview").run());

const shipment = program.command("shipment").description("Manage shipments");
shipment.command("list")
  .description("List all shipments")
  .option("-s, --status <status>", "Filter by status")
  .option("-o, --origin <origin>", "Filter by origin")
  .option("-d, --destination <destination>", "Filter by destination")
  .action((opts) => require("../commands/shipment").list(opts));
shipment.command("create")
  .description("Create a new shipment (interactive)")
  .action(() => require("../commands/shipment").create());
shipment.command("get <id>")
  .description("Get shipment details")
  .action((id) => require("../commands/shipment").get(id));
shipment.command("status <id> <status>")
  .description("Update shipment status")
  .option("-l, --location <location>", "Location of status update")
  .action((id, status, opts) => require("../commands/shipment").updateStatus(id, status, opts));
shipment.command("track <id>")
  .description("Record a tracking event (interactive)")
  .action((id) => require("../commands/shipment").track(id));

const compliance = program.command("compliance").description("Manage compliance");
compliance.command("check <shipment-id>")
  .description("Run compliance checks on a shipment")
  .action((id) => require("../commands/compliance").runCheck(id));
compliance.command("results <shipment-id>")
  .description("View compliance check results")
  .action((id) => require("../commands/compliance").results(id));
compliance.command("rules")
  .description("List compliance rules")
  .option("-t, --type <type>", "Filter by rule type")
  .action((opts) => require("../commands/compliance").rules(opts));

const doc = program.command("doc").description("Manage documents");
doc.command("compile <file>")
  .description("Compile a document source file")
  .option("-f, --format <format>", "Output format (html|markdown)", "html")
  .action((file, opts) => require("../commands/documents").compile(file, opts));
doc.command("create <shipment-id> <file>")
  .description("Compile and save a document to a shipment")
  .option("-f, --format <format>", "Output format", "html")
  .option("-t, --type <type>", "Document type", "report")
  .action((id, file, opts) => require("../commands/documents").create(id, file, opts));

const notif = program.command("notif").description("Manage notifications");
notif.command("list")
  .description("List notifications")
  .option("-u, --unread", "Unread only")
  .action((opts) => require("../commands/notifications").list(opts));
notif.command("read <id>")
  .description("Mark notification as read")
  .action((id) => require("../commands/notifications").markRead(id));
notif.command("read-all")
  .description("Mark all notifications as read")
  .action(() => require("../commands/notifications").markAllRead());

const authCmd = program.command("auth").description("Authentication");
authCmd.command("login")
  .description("Login and get JWT token (interactive)")
  .action(() => require("../commands/auth-cmd").login());
authCmd.command("register")
  .description("Register a new user (interactive)")
  .action(() => require("../commands/auth-cmd").register());

const network = program.command("network").description("Manage P2P network");
network.command("status")
  .description("Show P2P network status and connected peers")
  .action(() => require("../commands/network").status());
network.command("connect <address>")
  .description("Connect to a peer (host:port)")
  .action((addr) => require("../commands/network").connect(addr));

program.parse(process.argv);

if (!process.argv.slice(2).length) program.outputHelp();
