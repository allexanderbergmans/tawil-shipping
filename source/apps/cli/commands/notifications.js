const { notification } = require("@global-logistics/core/models");
const { fmtDate, table } = require("../lib/format");

async function list(opts) {
  const n = notification.all(opts.unread);
  if (n.length === 0) { console.log("\n  No notifications.\n"); return; }
  console.log("\n" + table(["Type", "Subject", "Date"],
    n.map(not => [not.type, (not.subject || "").slice(0, 60), fmtDate(not.created_at)])
  ) + "\n");
}

async function markRead(id) {
  const n = notification.markRead(id);
  if (!n) { console.log("\n  Notification not found.\n"); return; }
  console.log(`\n  Marked as read.\n`);
}

async function markAllRead() {
  notification.markAllRead();
  console.log(`\n  All notifications marked as read.\n`);
}

module.exports = { list, markRead, markAllRead };
