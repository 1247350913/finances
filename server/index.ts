import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { PDFParse } from "pdf-parse";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "./lib/db";
import { authRouter } from "./auth/router";
import { authConfig } from "./lib/authConfig";
import { verifyAuthToken } from "./auth/token";

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
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "25mb" }));
app.use("/api/auth", authRouter);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, message: "Backend server is running" });
});

type AuthenticatedUser = {
  id: string;
  email: string;
  auth_version: number;
};

async function getAuthenticatedUserFromCookie(req: express.Request): Promise<AuthenticatedUser | null> {
  const token = req.cookies?.[authConfig.cookieName] as string | undefined;
  if (!token) return null;

  try {
    const payload = verifyAuthToken(token);
    const result = await db.query<AuthenticatedUser>(
      "select id, email, auth_version from public.users where id = $1 limit 1",
      [payload.sub]
    );

    const user = result.rows[0] ?? null;
    if (!user || user.auth_version !== payload.tokenVersion) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
}

app.get("/api/overview", async (req, res) => {
  try {
    const user = await getAuthenticatedUserFromCookie(req);
    if (!user) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }

    const [groupsResult, accountsResult, valuesResult, settingsResult] = await Promise.all([
      db.query("select id, name from public.entry_groups where user_id = $1 order by position asc", [user.id]),
      db.query("select id, group_id, name from public.entry_accounts where user_id = $1 order by position asc", [user.id]),
      db.query("select account_id, year, value from public.entry_account_values where user_id = $1 order by year asc", [user.id]),
      db.query(
        "select start_year, end_year, overview_widgets, overview_chart_settings, overview_caption_md from public.entry_settings where user_id = $1 limit 1",
        [user.id]
      ),
    ]);

    res.json({
      ok: true,
      data: {
        groups: groupsResult.rows,
        accounts: accountsResult.rows,
        values: valuesResult.rows,
        settings: settingsResult.rows[0] ?? null,
        birth_date: null,
      },
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ ok: false, error: error?.message ?? "Could not load overview data" });
  }
});

app.patch("/api/overview/layout", async (req, res) => {
  try {
    const user = await getAuthenticatedUserFromCookie(req);
    if (!user) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const overviewWidgets = Array.isArray(body.overview_widgets) ? body.overview_widgets : [];
    const overviewCaptionMd = typeof body.overview_caption_md === "string" ? body.overview_caption_md : "";
    const overviewChartSettings =
      body.overview_chart_settings && typeof body.overview_chart_settings === "object"
        ? body.overview_chart_settings
        : {};

    await db.query(
      `insert into public.entry_settings (
         user_id,
         overview_widgets,
         overview_caption_md,
         overview_chart_settings,
         updated_at
       )
       values ($1, $2::jsonb, $3, $4::jsonb, now())
       on conflict (user_id)
       do update set
         overview_widgets = excluded.overview_widgets,
         overview_caption_md = excluded.overview_caption_md,
         overview_chart_settings = excluded.overview_chart_settings,
         updated_at = now()`,
      [user.id, JSON.stringify(overviewWidgets), overviewCaptionMd, JSON.stringify(overviewChartSettings)]
    );

    res.json({ ok: true });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ ok: false, error: error?.message ?? "Could not save overview layout" });
  }
});

app.get("/api/entry", async (req, res) => {
  try {
    const user = await getAuthenticatedUserFromCookie(req);
    if (!user) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }

    const [groupsResult, accountsResult, valuesResult, settingsResult] = await Promise.all([
      db.query("select id, name, position from public.entry_groups where user_id = $1 order by position asc", [user.id]),
      db.query("select id, group_id, name, coin_symbol, position from public.entry_accounts where user_id = $1 order by position asc", [user.id]),
      db.query("select account_id, year, value from public.entry_account_values where user_id = $1 order by year asc", [user.id]),
      db.query("select start_year, end_year from public.entry_settings where user_id = $1 limit 1", [user.id]),
    ]);

    res.json({
      ok: true,
      data: {
        groups: groupsResult.rows,
        accounts: accountsResult.rows,
        values: valuesResult.rows,
        settings: settingsResult.rows[0] ?? null,
      },
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ ok: false, error: error?.message ?? "Could not load entry data" });
  }
});

app.put("/api/entry", async (req, res) => {
  const client = await db.connect();
  try {
    const user = await getAuthenticatedUserFromCookie(req);
    if (!user) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const groups = Array.isArray(body.groups) ? body.groups : [];
    const startYear = typeof body.startYear === "number" ? body.startYear : null;
    const endYear = typeof body.endYear === "number" ? body.endYear : null;

    await client.query("begin");
    await client.query("delete from public.entry_account_values where user_id = $1", [user.id]);
    await client.query("delete from public.entry_accounts where user_id = $1", [user.id]);
    await client.query("delete from public.entry_groups where user_id = $1", [user.id]);

    for (const rawGroup of groups) {
      const group = (rawGroup ?? {}) as Record<string, unknown>;
      const groupId = String(group.id ?? "");
      const groupName = String(group.name ?? "");
      const groupPosition = Number(group.position ?? 0);
      const accounts = Array.isArray(group.accounts) ? group.accounts : [];

      if (!groupId) continue;

      await client.query(
        "insert into public.entry_groups (id, user_id, name, position) values ($1, $2, $3, $4)",
        [groupId, user.id, groupName, groupPosition]
      );

      for (const rawAccount of accounts) {
        const account = (rawAccount ?? {}) as Record<string, unknown>;
        const accountId = String(account.id ?? "");
        const accountName = String(account.name ?? "");
        const coinSymbol = typeof account.coin_symbol === "string" ? account.coin_symbol : null;
        const accountPosition = Number(account.position ?? 0);
        const values = (account.values ?? {}) as Record<string, unknown>;

        if (!accountId) continue;

        await client.query(
          `insert into public.entry_accounts
            (id, user_id, group_id, name, coin_symbol, position)
           values ($1, $2, $3, $4, $5, $6)`,
          [accountId, user.id, groupId, accountName, coinSymbol, accountPosition]
        );

        for (const [rawYear, rawValue] of Object.entries(values)) {
          const year = Number(rawYear);
          const value = String(rawValue ?? "").trim();
          if (!Number.isFinite(year) || !value) continue;

          await client.query(
            "insert into public.entry_account_values (user_id, account_id, year, value) values ($1, $2, $3, $4)",
            [user.id, accountId, year, value]
          );
        }
      }
    }

    if (startYear === null && endYear === null) {
      await client.query("delete from public.entry_settings where user_id = $1", [user.id]);
    } else {
      await client.query(
        `insert into public.entry_settings (user_id, start_year, end_year, updated_at)
         values ($1, $2, $3, now())
         on conflict (user_id)
         do update set start_year = excluded.start_year, end_year = excluded.end_year, updated_at = now()`,
        [user.id, startYear, endYear]
      );
    }

    await client.query("commit");
    res.json({ ok: true });
  } catch (error: any) {
    await client.query("rollback");
    console.error(error);
    res.status(500).json({ ok: false, error: error?.message ?? "Could not save entry data" });
  } finally {
    client.release();
  }
});

app.get("/api/expenses/accounts", async (req, res) => {
  try {
    const user = await getAuthenticatedUserFromCookie(req);
    if (!user) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }

    const rows = await db.query(
      `select id, name, institution, card_image_data_url, parser_file_name, parser_source
       from public.accounts
       where user_id = $1 and account_type = 'expense' and archived = false
       order by created_at asc`,
      [user.id]
    );

    res.json({ ok: true, data: rows.rows });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ ok: false, error: error?.message ?? "Could not load expense accounts" });
  }
});

app.post("/api/expenses/accounts", async (req, res) => {
  try {
    const user = await getAuthenticatedUserFromCookie(req);
    if (!user) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    const institution = typeof body.institution === "string" ? body.institution : null;
    const cardImageDataUrl = typeof body.card_image_data_url === "string" ? body.card_image_data_url : null;
    const parserFileName = typeof body.parser_file_name === "string" ? body.parser_file_name : null;
    const parserSource = typeof body.parser_source === "string" ? body.parser_source : null;

    if (!name) {
      res.status(400).json({ ok: false, error: "Account name is required." });
      return;
    }

    await db.query(
      `insert into public.accounts
       (user_id, name, institution, account_type, card_image_data_url, parser_file_name, parser_source)
       values ($1, $2, $3, 'expense', $4, $5, $6)`,
      [user.id, name, institution, cardImageDataUrl, parserFileName, parserSource]
    );

    res.json({ ok: true });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ ok: false, error: error?.message ?? "Could not add expense account" });
  }
});

app.patch("/api/expenses/accounts/:accountId", async (req, res) => {
  try {
    const user = await getAuthenticatedUserFromCookie(req);
    if (!user) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }

    const accountId = String(req.params.accountId ?? "");
    const body = (req.body ?? {}) as Record<string, unknown>;
    const updates: string[] = [];
    const values: unknown[] = [user.id, accountId];

    if (typeof body.name === "string") {
      values.push(body.name.trim());
      updates.push(`name = $${values.length}`);
    }
    if (Object.prototype.hasOwnProperty.call(body, "institution")) {
      values.push(typeof body.institution === "string" ? body.institution : null);
      updates.push(`institution = $${values.length}`);
    }
    if (Object.prototype.hasOwnProperty.call(body, "card_image_data_url")) {
      values.push(typeof body.card_image_data_url === "string" ? body.card_image_data_url : null);
      updates.push(`card_image_data_url = $${values.length}`);
    }
    if (Object.prototype.hasOwnProperty.call(body, "parser_file_name")) {
      values.push(typeof body.parser_file_name === "string" ? body.parser_file_name : null);
      updates.push(`parser_file_name = $${values.length}`);
    }
    if (Object.prototype.hasOwnProperty.call(body, "parser_source")) {
      values.push(typeof body.parser_source === "string" ? body.parser_source : null);
      updates.push(`parser_source = $${values.length}`);
    }

    if (updates.length === 0) {
      res.json({ ok: true });
      return;
    }

    const result = await db.query(
      `update public.accounts
       set ${updates.join(", ")}
       where user_id = $1 and id = $2 and account_type = 'expense'`,
      values
    );

    if ((result.rowCount ?? 0) === 0) {
      res.status(404).json({ ok: false, error: "Account not found." });
      return;
    }

    res.json({ ok: true });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ ok: false, error: error?.message ?? "Could not update expense account" });
  }
});

app.patch("/api/expenses/accounts/:accountId/archive", async (req, res) => {
  try {
    const user = await getAuthenticatedUserFromCookie(req);
    if (!user) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }

    const accountId = String(req.params.accountId ?? "");
    const result = await db.query(
      `update public.accounts
       set archived = true
       where user_id = $1 and id = $2 and account_type = 'expense'`,
      [user.id, accountId]
    );

    if ((result.rowCount ?? 0) === 0) {
      res.status(404).json({ ok: false, error: "Account not found." });
      return;
    }

    res.json({ ok: true });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ ok: false, error: error?.message ?? "Could not archive account" });
  }
});

app.delete("/api/expenses/accounts/:accountId", async (req, res) => {
  try {
    const user = await getAuthenticatedUserFromCookie(req);
    if (!user) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }

    const accountId = String(req.params.accountId ?? "");
    const result = await db.query(
      "delete from public.accounts where user_id = $1 and id = $2 and account_type = 'expense'",
      [user.id, accountId]
    );

    if ((result.rowCount ?? 0) === 0) {
      res.status(404).json({ ok: false, error: "Account not found." });
      return;
    }

    res.json({ ok: true });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ ok: false, error: error?.message ?? "Could not delete account" });
  }
});

app.get("/api/expenses/statements", async (req, res) => {
  try {
    const user = await getAuthenticatedUserFromCookie(req);
    if (!user) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }

    const accountId = String(req.query.accountId ?? "").trim();
    const accountIdsRaw = String(req.query.accountIds ?? "").trim();

    let query =
      "select id, account_id, statement_date, file_name, file_data_url, parsed_result from public.account_statements where user_id = $1";
    const params: unknown[] = [user.id];

    if (accountId) {
      params.push(accountId);
      query += ` and account_id = $${params.length}`;
    } else if (accountIdsRaw) {
      const accountIds = accountIdsRaw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      if (accountIds.length > 0) {
        params.push(accountIds);
        query += ` and account_id = any($${params.length}::uuid[])`;
      }
    }

    query += " order by statement_date asc";

    const result = await db.query(query, params);
    res.json({ ok: true, data: result.rows });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ ok: false, error: error?.message ?? "Could not load statements" });
  }
});

app.get("/api/expenses/statements/existing", async (req, res) => {
  try {
    const user = await getAuthenticatedUserFromCookie(req);
    if (!user) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }

    const accountId = String(req.query.accountId ?? "").trim();
    const statementDate = String(req.query.statementDate ?? "").trim();

    if (!accountId || !statementDate) {
      res.status(400).json({ ok: false, error: "accountId and statementDate are required." });
      return;
    }

    const result = await db.query(
      "select id from public.account_statements where user_id = $1 and account_id = $2 and statement_date = $3 limit 1",
      [user.id, accountId, statementDate]
    );

    res.json({ ok: true, exists: (result.rowCount ?? 0) > 0 });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ ok: false, error: error?.message ?? "Could not check statement" });
  }
});

app.put("/api/expenses/statements", async (req, res) => {
  try {
    const user = await getAuthenticatedUserFromCookie(req);
    if (!user) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const accountId = String(body.account_id ?? "").trim();
    const statementDate = String(body.statement_date ?? "").trim();
    const fileName = String(body.file_name ?? "").trim();
    const fileDataUrl = String(body.file_data_url ?? "").trim();
    const parsedResult = typeof body.parsed_result === "string" ? body.parsed_result : null;

    if (!accountId || !statementDate || !fileName || !fileDataUrl) {
      res.status(400).json({ ok: false, error: "Missing required statement fields." });
      return;
    }

    await db.query(
      `insert into public.account_statements
        (user_id, account_id, statement_date, file_name, file_data_url, parsed_result)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (account_id, statement_date)
       do update set
         file_name = excluded.file_name,
         file_data_url = excluded.file_data_url,
         parsed_result = excluded.parsed_result`,
      [user.id, accountId, statementDate, fileName, fileDataUrl, parsedResult]
    );

    res.json({ ok: true });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ ok: false, error: error?.message ?? "Could not save statement" });
  }
});

app.patch("/api/expenses/statements/:statementId", async (req, res) => {
  try {
    const user = await getAuthenticatedUserFromCookie(req);
    if (!user) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }

    const statementId = String(req.params.statementId ?? "");
    const parsedResult = typeof req.body?.parsed_result === "string" ? req.body.parsed_result : null;

    const result = await db.query(
      "update public.account_statements set parsed_result = $1 where id = $2 and user_id = $3",
      [parsedResult, statementId, user.id]
    );

    if ((result.rowCount ?? 0) === 0) {
      res.status(404).json({ ok: false, error: "Statement not found." });
      return;
    }

    res.json({ ok: true });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ ok: false, error: error?.message ?? "Could not update statement" });
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

function getBearerToken(authHeader: string | undefined) {
  const header = String(authHeader ?? "").trim();
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

function createAdminSupabaseClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      "Missing Supabase server environment variables. Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.development (or your server runtime env)."
    );
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

app.post("/api/account/delete", async (req, res) => {
  try {
    const token = getBearerToken(req.header("authorization"));
    if (!token) {
      res.status(401).json({ ok: false, message: "Missing access token." });
      return;
    }

    const adminSupabase = createAdminSupabaseClient();

    const { data: userData, error: userError } = await adminSupabase.auth.getUser(token);
    if (userError || !userData.user) {
      res.status(401).json({ ok: false, message: "Invalid or expired session." });
      return;
    }

    const { error: deleteError } = await adminSupabase.auth.admin.deleteUser(userData.user.id, false);
    if (deleteError) {
      throw deleteError;
    }

    res.json({ ok: true });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ ok: false, message: error?.message ?? "Could not delete account." });
  }
});

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
