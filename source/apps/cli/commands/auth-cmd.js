const auth = require("@global-logistics/auth");
const readline = require("readline");

function rl() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(query) {
  return new Promise(resolve => {
    const i = rl();
    i.question(query + " ", a => { i.close(); resolve(a); });
  });
}

async function login() {
  const username = await ask("Username:");
  const password = await ask("Password:");
  const result = auth.login(username, password);
  if (!result) { console.log("\n  Invalid credentials.\n"); return; }
  console.log(`\n  Logged in as \x1b[32m${result.user.username}\x1b[0m (${result.user.role})`);
  console.log(`  Token: \x1b[90m${result.token.slice(0, 50)}...\x1b[0m\n`);
}

async function register() {
  const username = await ask("Username:");
  const email = await ask("Email:");
  const password = await ask("Password:");
  const role = await ask("Role (operator/viewer):") || "operator";
  const result = auth.register({ username, email, password, role });
  if (result.error) { console.log(`\n  \x1b[31m${result.error}\x1b[0m\n`); return; }
  console.log(`\n  Registered \x1b[32m${result.user.username}\x1b[0m\n`);
}

module.exports = { login, register };
