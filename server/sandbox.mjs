import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const worker = path.join(root, "sandbox-worker.mjs");

export function runSandbox(job, readableFiles = []) {
  const args = [
    "--permission",
    "--disallow-code-generation-from-strings",
    "--max-old-space-size=48",
    "--max-semi-space-size=1",
    "--no-warnings",
    `--allow-fs-read=${worker}`,
    ...readableFiles.map((file) => `--allow-fs-read=${file}`),
    worker,
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: {
        SystemRoot: process.env.SystemRoot,
        windir: process.env.windir,
        PATH: process.env.PATH,
      },
    });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill();
      reject(Object.assign(new Error("沙盒超时"), { code: "ETIMEDOUT" }));
    }, 10000);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      const out = Buffer.concat(stdout).toString("utf8").trim();
      const err = Buffer.concat(stderr).toString("utf8").trim();
      if (!out) {
        reject(Object.assign(new Error(err || `沙盒退出 ${code}`), { code: "ESANDBOX" }));
        return;
      }
      try {
        const parsed = JSON.parse(out.slice(out.lastIndexOf("\n") + 1));
        parsed.exitCode = code;
        resolve(parsed);
      } catch {
        reject(Object.assign(new Error(err || out), { code: "ESANDBOX" }));
      }
    });
    child.stdin.end(JSON.stringify(job));
  });
}
