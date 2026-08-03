/**
 * Runner Windows-compatible for Firestore Rules suite.
 * 1) Allocates free ports (does NOT write firebase.rules-test.json).
 * 2) Runs tests inside firebase emulators:exec.
 * 3) After emulator full shutdown, asserts clean logs.
 * 4) Preserves the test process exit code.
 */
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import {
  writeFileSync,
  unlinkSync,
  existsSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const configPath = resolve(root, ".firebase.rules-test.generated.json");
const logPath = resolve(root, "firestore-debug.log");
const rulesPath = resolve(root, "firestore.rules");
const testCommand =
  "tsx --test tests/firestore-rules/user-profiles.test.ts";

function fail(message) {
  console.error(`[run-firestore-rules-tests] ${message}`);
  process.exitCode = 1;
}

function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("unable to allocate port")));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) reject(error);
        else resolvePort(port);
      });
    });
  });
}

function runCaptured(commandLine) {
  return new Promise((resolveRun) => {
    const child = spawn(commandLine, {
      cwd: root,
      env: process.env,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on("error", (error) => {
      resolveRun({
        code: 1,
        stdout,
        stderr: `${stderr}\n${error instanceof Error ? error.message : String(error)}`,
      });
    });
    child.on("exit", (code) => {
      resolveRun({ code: code ?? 1, stdout, stderr });
    });
  });
}

function findAllowLine(rulesLines, matchNeedle, allowNeedle) {
  let inMatch = false;
  for (let i = 0; i < rulesLines.length; i++) {
    const line = rulesLines[i];
    if (line.includes(matchNeedle)) {
      inMatch = true;
      continue;
    }
    if (inMatch && /^\s*match \//.test(line)) {
      inMatch = false;
      continue;
    }
    if (inMatch && line.includes(allowNeedle)) {
      return i + 1;
    }
  }
  return null;
}

function countMatches(text, pattern) {
  return (text.match(pattern) || []).length;
}

function extractWarningBodies(logText) {
  const logLines = logText.split(/\r?\n/);
  const bodies = [];
  for (let i = 0; i < logLines.length; i++) {
    if (logLines[i].startsWith("WARNING: Operation failed:")) {
      bodies.push((logLines[i + 1] || "").trim());
    }
  }
  return bodies;
}

function assertCleanLogs({ stdout, stderr }) {
  const failures = [];

  if (!existsSync(logPath)) {
    fail(`missing ${logPath} after emulator shutdown`);
    return;
  }
  if (!existsSync(rulesPath)) {
    fail(`missing ${rulesPath}`);
    return;
  }

  const rules = readFileSync(rulesPath, "utf8");
  if (rules.includes("request.writeFields")) {
    failures.push("firestore.rules still references undocumented request.writeFields");
  }

  const logText = readFileSync(logPath, "utf8");
  const warningBodies = extractWarningBodies(logText);
  const combinedWarnings = warningBodies.join("\n");
  const combinedAll = [stdout, stderr, logText].join("\n");

  const expressionLimit = countMatches(
    combinedAll,
    /maximum of 1000 expressions|expression limit/gi,
  );
  if (expressionLimit > 0) {
    failures.push(`expression limit: ${expressionLimit}`);
  }

  const rulesLines = rules.split(/\r?\n/);
  const targets = [
    {
      key: "orders create",
      line: findAllowLine(rulesLines, "match /orders/{orderId}", "allow create:"),
    },
    {
      key: "orders update",
      line: findAllowLine(rulesLines, "match /orders/{orderId}", "allow update:"),
    },
    {
      key: "orderItems create",
      line: findAllowLine(
        rulesLines,
        "match /orderItems/{orderItemId}",
        "allow create:",
      ),
    },
    {
      key: "orderItems update",
      line: findAllowLine(
        rulesLines,
        "match /orderItems/{orderItemId}",
        "allow update:",
      ),
    },
    {
      key: "payments create",
      line: findAllowLine(rulesLines, "match /payments/{paymentId}", "allow create:"),
    },
    {
      key: "payments update",
      line: findAllowLine(rulesLines, "match /payments/{paymentId}", "allow update:"),
    },
  ];

  const trackedLines = new Set();
  const counts = {};

  for (const target of targets) {
    counts[target.key] = 0;
    if (target.line == null) {
      failures.push(`could not locate rules line for ${target.key}`);
      continue;
    }
    trackedLines.add(target.line);
    const createEval = countMatches(
      combinedWarnings,
      new RegExp(`evaluation error at L${target.line}\\b[^\\n]*for 'create'`, "g"),
    );
    const updateEval = countMatches(
      combinedWarnings,
      new RegExp(`evaluation error at L${target.line}\\b[^\\n]*for 'update'`, "g"),
    );
    const totalEval = countMatches(
      combinedWarnings,
      new RegExp(`evaluation error at L${target.line}\\b`, "g"),
    );
    counts[target.key] = totalEval;
    if (totalEval > 0) {
      failures.push(
        `${target.key}: ${totalEval} evaluation error(s) (L${target.line}; create=${createEval}, update=${updateEval})`,
      );
    }
  }

  const otherEval = countMatches(combinedWarnings, /evaluation error at L\d+\b/g);
  let trackedTotal = 0;
  for (const line of trackedLines) {
    trackedTotal += countMatches(
      combinedWarnings,
      new RegExp(`evaluation error at L${line}\\b`, "g"),
    );
  }
  const otros = Math.max(0, otherEval - trackedTotal);
  counts.otros = otros;

  console.log(
    "[run-firestore-rules-tests] evaluation summary:",
    JSON.stringify({
      "orders create": counts["orders create"] ?? 0,
      "orders update": counts["orders update"] ?? 0,
      "orderItems create": counts["orderItems create"] ?? 0,
      "orderItems update": counts["orderItems update"] ?? 0,
      "payments create": counts["payments create"] ?? 0,
      "payments update": counts["payments update"] ?? 0,
      otros: counts.otros ?? 0,
      "expression limit": expressionLimit,
    }),
  );

  if (failures.length > 0) {
    for (const message of failures) {
      fail(message);
    }
    console.log(
      `[run-firestore-rules-tests] backlog separado (no bloquea 1B): otros=${counts.otros ?? 0}`,
    );
    return;
  }

  console.log(
    `[run-firestore-rules-tests] OK micro-bloque 1B: 0 evaluation errors on orders/orderItems/payments; 0 expression-limit; otros=${counts.otros ?? 0} backlog separado; no writeFields.`,
  );
}

const firestorePort = await getFreePort();
const storagePort = await getFreePort();

writeFileSync(
  configPath,
  `${JSON.stringify(
    {
      firestore: {
        database: "(default)",
        rules: "firestore.rules",
        indexes: "firestore.indexes.json",
      },
      storage: {
        rules: "storage.rules",
      },
      emulators: {
        firestore: { port: firestorePort },
        storage: { port: storagePort },
        ui: { enabled: false },
        singleProjectMode: true,
      },
    },
    null,
    2,
  )}\n`,
  "utf8",
);

if (existsSync(logPath)) {
  rmSync(logPath, { force: true });
}

let testExitCode = 1;
let captured = { stdout: "", stderr: "" };

try {
  const result = await runCaptured(
    `npx firebase emulators:exec --config "${configPath}" --only firestore,storage --project demo-hostly-rules "${testCommand}"`,
  );
  testExitCode = result.code;
  captured = result;
} finally {
  if (existsSync(configPath)) {
    unlinkSync(configPath);
  }
}

assertCleanLogs(captured);

if (testExitCode !== 0) {
  process.exitCode = testExitCode;
  console.error(
    `[run-firestore-rules-tests] test suite exited with code ${testExitCode}`,
  );
} else if (!process.exitCode) {
  console.log(
    "[run-firestore-rules-tests] Suite + post-emulator log assertion OK",
  );
}
