// Starts the local stack: Postgres (docker), API, worker, frontend. Auth emulator is separate (`pnpm infra:auth`).
import { spawn, execSync } from "node:child_process";

execSync("docker compose -f infra/docker-compose.yml up -d --wait", { stdio: "inherit" });

const procs = [
  ["api", "pnpm dev:backend"],
  ["worker", "pnpm dev:worker"],
  ["web", "pnpm dev:frontend"],
].map(([name, cmd]) => {
  const p = spawn(cmd, { shell: true, stdio: ["ignore", "pipe", "pipe"] });
  const tag = (d) => d.toString().split("\n").filter(Boolean).forEach((l) => console.log(`[${name}] ${l}`));
  p.stdout.on("data", tag);
  p.stderr.on("data", tag);
  return p;
});

const stop = () => procs.forEach((p) => p.kill());
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
