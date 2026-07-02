const crypto = require("crypto");

const password = process.argv.slice(2).join(" ");
if (!password) {
  console.error("Usage: npm run hash-password -- \"your password\"");
  process.exit(1);
}

const salt = crypto.randomBytes(16).toString("base64url");
crypto.scrypt(password, salt, 64, (err, derivedKey) => {
  if (err) throw err;
  console.log(`scrypt$${salt}$${derivedKey.toString("base64url")}`);
});
