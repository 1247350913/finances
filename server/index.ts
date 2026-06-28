import express from "express";
import cors from "cors";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { PDFParse } from "pdf-parse";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

loadEnv({ path: ".env.development" });
loadEnv();

const app = express();
const PORT = Number(process.env.PORT ?? 3001);
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// In production, restrict CORS to known frontend origins only.
// ALLOWED_ORIGINS is a comma-separated list set via Cloud Run env var.
// In dev, all origins are allowed for convenience.
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : null;

app.use(
  cors({
    origin: allowedOrigins
      ? (origin, callback) => {
          // Allow requests with no origin (server-to-server, curl, health checks)
          if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error(`CORS: origin ${origin} not allowed`));
          }
        }
      : true,
    methods: ["GET", "POST"],
  })
);
app.use(express.json({ limit: "25mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, message: "Backend server is running" });
});
app.get("/api/heartbeat", async (_req, res) => {
  try {
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      res.status(500).json({
        ok: false,
        message: "Missing Supabase server environment variables for heartbeat checks.",
      });
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const checkedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from("heartbeat")
      .upsert({ id: 1, checked_at: checkedAt }, { onConflict: "id" })
      .select("id, checked_at")
      .single();

    if (error) {
      throw error;
    }

    res.json({ ok: true, heartbeat: data ?? { id: 1, checked_at: checkedAt } });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ ok: false, message: error?.message ?? "Could not reach Supabase." });
  }
});
app.get("/", (_req, res) => {
  res.json({ ok: true, message: "Backend server root found" });
});

type ParseRequest = {
  fileName: string;
  fileDataUrl: string;
};

type CustomParserTestRequest = ParseRequest & {
  parserSource: string;
};

app.post("/api/parse/capital-one", async (req, res) => {
  try {
    const body = req.body as Partial<ParseRequest>;
    const fileName = String(body.fileName ?? "");
    const fileDataUrl = String(body.fileDataUrl ?? "");

    if (!fileName || !fileDataUrl) {
      res.status(400).json({ ok: false, message: "fileName and fileDataUrl are required." });
      return;
    }

    const text = await extractTextFromDataUrl(fileName, fileDataUrl);
    const parsed = parseCapitalOneExpenses(text);
    res.json({ ok: true, parsed });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ ok: false, message: error?.message ?? "Could not parse statement." });
  }
});

app.post("/api/parse/custom-parser-test", async (req, res) => {
  try {
    const body = req.body as Partial<CustomParserTestRequest>;
    const fileName = String(body.fileName ?? "");
    const fileDataUrl = String(body.fileDataUrl ?? "");
    const parserSource = String(body.parserSource ?? "");

    if (!fileName || !fileDataUrl || !parserSource) {
      res.status(400).json({ ok: false, message: "fileName, fileDataUrl, and parserSource are required." });
      return;
    }

    const statementText = await extractTextFromDataUrl(fileName, fileDataUrl);
    const parsed = await runCustomPythonParser(parserSource, statementText);

    res.json({ ok: true, parsed });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ ok: false, message: error?.message ?? "Could not run custom parser test." });
  }
});

async function extractTextFromDataUrl(fileName: string, dataUrl: string) {
  const mime = dataUrl.match(/^data:([^;,]+)/)?.[1] ?? "application/octet-stream";
  const payload = dataUrl.split(",")[1] ?? "";
  const lower = fileName.toLowerCase();

  const buffer = Buffer.from(payload, "base64");

  if (mime.includes("pdf") || lower.endsWith(".pdf")) {
    const parser = new PDFParse({ data: buffer });
    const parsed = await parser.getText();
    await parser.destroy();
    return parsed.text ?? "";
  }

  return buffer.toString("utf-8");
}

function parseCapitalOneExpenses(text: string) {
  const excluded = ["payment", "autopay", "late fee", "due date", "interest charge", "fees for this period", "interest for this period"];
  const amountRegex = /-?\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})/g;
  const dateRegex = /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g;
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const transactions: Array<{ description: string; amount: number }> = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (excluded.some((word) => lower.includes(word))) continue;

    const matches = line.match(amountRegex);
    if (!matches || matches.length === 0) continue;

    const rawAmount = matches[matches.length - 1].replace(/[$,]/g, "");
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount === 0) continue;

    const withoutDates = line.replace(dateRegex, " ").trim();
    const rawDescription = withoutDates.replace(/-?\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})\s*$/, "").trim();
    const description = normalizeDescription(rawDescription);
    if (!description) continue;

    transactions.push({ description, amount });
  }

  const groupedMap = new Map<string, { description: string; amount: number; transactions: Array<{ description: string; amount: number }> }>();
  for (const tx of transactions) {
    const key = tx.description;
    const existing = groupedMap.get(key) ?? { description: key, amount: 0, transactions: [] };
    existing.amount += tx.amount;
    existing.transactions.push(tx);
    groupedMap.set(key, existing);
  }

  const groups = [...groupedMap.values()].sort((a, b) => b.amount - a.amount);
  const total = groups.reduce((sum, group) => sum + group.amount, 0);

  return {
    total,
    groups,
  };
}

function normalizeDescription(value: string) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  if (compact.length > 120) return compact.slice(0, 120);
  return compact;
}

async function runCustomPythonParser(parserSource: string, statementText: string) {
  const tempDir = await mkdtemp(join(tmpdir(), "finances-parser-test-"));
  const parserPath = join(tempDir, "custom_parser.py");
  const runnerPath = join(tempDir, "runner.py");
  const outputPath = join(tempDir, "result.json");

  const runnerSource = [
    "import json",
    "import pathlib",
    "import sys",
    "",
    "from custom_parser import parse_statement_text",
    "",
    "def main() -> int:",
    "    if len(sys.argv) != 3:",
    "        print('runner expects statement path and output path', file=sys.stderr)",
    "        return 1",
    "",
    "    statement_path = pathlib.Path(sys.argv[1])",
    "    output_path = pathlib.Path(sys.argv[2])",
    "    statement_text = statement_path.read_text(encoding='utf-8')",
    "    result = parse_statement_text(statement_text)",
    "    output_path.write_text(json.dumps(result), encoding='utf-8')",
    "    return 0",
    "",
    "if __name__ == '__main__':",
    "    raise SystemExit(main())",
    "",
  ].join("\n");

  const statementPath = join(tempDir, "statement.txt");

  try {
    await writeFile(parserPath, parserSource, "utf-8");
    await writeFile(runnerPath, runnerSource, "utf-8");
    await writeFile(statementPath, statementText, "utf-8");

    const stderrChunks: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
      const proc = spawn("python", [runnerPath, statementPath, outputPath], {
        cwd: tempDir,
        stdio: ["ignore", "ignore", "pipe"],
      });

      proc.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

      proc.on("error", (err) => {
        reject(new Error(`Could not run python: ${err.message}`));
      });

      proc.on("exit", (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        const stderr = Buffer.concat(stderrChunks).toString("utf-8").trim();
        reject(new Error(stderr || `Parser process exited with code ${code}`));
      });
    });

    const outputRaw = await readFile(outputPath, "utf-8");
    return JSON.parse(outputRaw);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
