/** Local sandbox forwarding. Server keys and signing secrets are never printed. */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { loadEnv } from "./load-env";

loadEnv();

async function main() {
  const apiKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!apiKey || !/^(?:rk|sk)_test_/.test(apiKey)) throw new Error("stripe_sandbox_key_required");
  const env = { ...process.env, STRIPE_API_KEY: apiKey };
  const prefix = ["--yes", "@stripe/cli"];
  const secret = await new Promise<string>((resolve, reject) => {
    const child = spawn("npx", [...prefix, "listen", "--print-secret", "--skip-update"], { env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const timeout = setTimeout(() => { child.kill(); reject(new Error("stripe_listener_timeout")); }, 30_000);
    child.stdout.on("data", (chunk) => { output = (output + String(chunk)).slice(-4096); });
    child.stderr.resume();
    child.on("error", () => { clearTimeout(timeout); reject(new Error("stripe_listener_start_failed")); });
    child.on("close", (code) => {
      clearTimeout(timeout);
      const value = output.match(/whsec_[A-Za-z0-9]+/)?.[0];
      if (code === 0 && value) resolve(value);
      else reject(new Error("stripe_listener_auth_failed"));
    });
  });
  const filename = ".env.local";
  const contents = readFileSync(filename, "utf8");
  const entry = `STRIPE_WEBHOOK_SECRET=${secret}`;
  const updated = /^STRIPE_WEBHOOK_SECRET=.*$/m.test(contents)
    ? contents.replace(/^STRIPE_WEBHOOK_SECRET=.*$/m, entry)
    : `${contents}\n${entry}\n`;
  if (contents !== updated) {
    writeFileSync(filename, updated);
    console.log("Sandbox webhook secret saved to .env.local. Restart the app to load it.");
  } else console.log("Sandbox webhook secret already matches .env.local.");

  const destination = process.env.STRIPE_WEBHOOK_FORWARD_URL ?? "http://localhost:3000/api/stripe/webhook";
  const url = new URL(destination);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("stripe_listener_localhost_required");
  const events = [
    "checkout.session.completed", "checkout.session.expired", "checkout.session.async_payment_succeeded",
    "checkout.session.async_payment_failed", "invoice.paid", "invoice.payment_failed",
    "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
  ].join(",");
  const listener = spawn("npx", [...prefix, "listen", "--forward-to", destination, "--events", events, "--latest", "--skip-update"], {
    env, stdio: ["inherit", "pipe", "pipe"],
  });
  let buffer = "";
  const report = (chunk: Buffer) => {
    buffer += String(chunk);
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop()!.slice(-4096);
    for (const line of lines) {
      if (line.includes("whsec_")) console.log(`Stripe sandbox webhooks are forwarding to ${url.origin}${url.pathname}. Keep this terminal open.`);
      const status = line.match(/\[(\d{3})\]/)?.[1];
      if (status) console.log(`stripe_webhook_http_${status}`);
      if (/failed to post|connection refused/i.test(line)) console.error("stripe_webhook_forward_failed");
    }
  };
  listener.stdout.on("data", report);
  listener.stderr.on("data", report);
  listener.on("error", () => { console.error("stripe_listener_start_failed"); process.exitCode = 1; });
  listener.on("close", (code) => { process.exitCode = code ?? 0; });
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => listener.kill(signal));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error && /^stripe_[a-z_]+$/.test(error.message) ? error.message : "stripe_listener_failed");
  process.exitCode = 1;
});
