import { readFile, writeFile, chmod } from "node:fs/promises";
import { parse } from "dotenv";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const path = new URL("../.env", import.meta.url);
let text = "";
try {
  text = await readFile(path, "utf8");
} catch {}
const env = parse(text);
let key = env.X402_PRIVATE_KEY;
if (!key) {
  key = generatePrivateKey();
  text += `\nX402_PRIVATE_KEY=${key}\n`;
  await writeFile(path, text, { mode: 0o600 });
  await chmod(path, 0o600);
}
if (!/^0x[0-9a-f]{64}$/i.test(key))
  throw new Error("The server wallet key is invalid (value omitted).");
const account = privateKeyToAccount(key as `0x${string}`);
console.info(
  JSON.stringify(
    {
      network: "Base mainnet",
      asset: "USDC",
      address: account.address,
      note: "Dedicated MenuLens server wallet. No funds have been transferred. The key is saved only in ignored .env.",
    },
    null,
    2,
  ),
);
