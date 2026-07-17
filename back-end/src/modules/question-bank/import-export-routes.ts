import { and, asc, eq, ilike, inArray, sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import { type FastifyPluginAsync } from "fastify";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { db } from "../../database/db.js";
import {
    questionOptions,
    questions,
    questionTags,
    questionVersions,
} from "../../database/schemas/index.js";

/* ---------- Shared Types ---------- */

type QuestionInsert = typeof questions.$inferInsert;

interface ExportQuestionRow {
  id: string;
  questionBankId: string;
  subjectId: string;
  topicId: string | null;
  type: string;
  difficulty: string;
  cognitiveLevel: string | null;
  marks: string;
  negativeMarks: string;
  estimatedTimeSecs: number | null;
  contentJson: Record<string, unknown>;
  mediaUrlsJson: string[] | null;
  solutionJson: { text?: string; explanation?: string } | null;
  isActive: boolean;
  version: number;
  options: { optionText: string; isCorrect: boolean; displayOrder: number }[];
  tags: string[];
}

/* ---------- Constants ---------- */

const EXPORT_LIMIT = 10000;
const INSERT_CHUNK_SIZE = 500;
const CHILD_CHUNK_SIZE = 2000;

/* ---------- Chunking Helper ---------- */

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/* ---------- Export Query Helper ---------- */

async function fetchQuestionsForExport(filters: {
  questionBankId?: string;
  subjectId?: string;
  type?: string;
  difficulty?: string;
  search?: string;
}): Promise<ExportQuestionRow[]> {
  const conditions: ReturnType<typeof eq>[] = [];
  if (filters.questionBankId)
    conditions.push(eq(questions.questionBankId, filters.questionBankId));
  if (filters.subjectId)
    conditions.push(eq(questions.subjectId, filters.subjectId));
  if (filters.type) conditions.push(eq(questions.type, filters.type as never));
  if (filters.difficulty)
    conditions.push(eq(questions.difficulty, filters.difficulty as never));
  if (filters.search)
    conditions.push(
      ilike(sql`CAST(${questions.contentJson} AS TEXT)`, `%${filters.search}%`),
    );

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(questions)
    .where(where)
    .orderBy(asc(questions.createdAt))
    .limit(EXPORT_LIMIT);

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);

  const [allOptions, allTags] = await Promise.all([
    db
      .select()
      .from(questionOptions)
      .where(inArray(questionOptions.questionId, ids))
      .orderBy(asc(questionOptions.displayOrder)),
    db.select().from(questionTags).where(inArray(questionTags.questionId, ids)),
  ]);

  const optionsMap = new Map<string, ExportQuestionRow["options"]>();
  for (const opt of allOptions) {
    const arr = optionsMap.get(opt.questionId) ?? [];
    arr.push({
      optionText: opt.optionText,
      isCorrect: opt.isCorrect,
      displayOrder: opt.displayOrder,
    });
    optionsMap.set(opt.questionId, arr);
  }

  const tagsMap = new Map<string, string[]>();
  for (const t of allTags) {
    const arr = tagsMap.get(t.questionId) ?? [];
    arr.push(t.tag);
    tagsMap.set(t.questionId, arr);
  }

  return rows.map((r) => ({
    id: r.id,
    questionBankId: r.questionBankId,
    subjectId: r.subjectId,
    topicId: r.topicId,
    type: r.type,
    difficulty: r.difficulty,
    cognitiveLevel: r.cognitiveLevel,
    marks: r.marks,
    negativeMarks: r.negativeMarks,
    estimatedTimeSecs: r.estimatedTimeSecs,
    contentJson: r.contentJson as Record<string, unknown>,
    mediaUrlsJson: r.mediaUrlsJson as string[] | null,
    solutionJson: r.solutionJson as ExportQuestionRow["solutionJson"],
    isActive: r.isActive,
    version: r.version,
    options: optionsMap.get(r.id) ?? [],
    tags: tagsMap.get(r.id) ?? [],
  }));
}

/* ---------- Batch Insert Helper ---------- */

async function batchInsertQuestions(
  tx: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0],
  items: QuestionInsert[],
): Promise<{ id: string }[]> {
  const results: { id: string }[] = [];
  for (const batch of chunk(items, INSERT_CHUNK_SIZE)) {
    const inserted = await tx
      .insert(questions)
      .values(batch)
      .returning({ id: questions.id });
    results.push(...inserted);
  }
  return results;
}

async function batchInsertChildren<T extends { questionId: string }>(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  table: typeof questionOptions | typeof questionTags | typeof questionVersions,
  rows: T[],
): Promise<void> {
  for (const batch of chunk(rows, CHILD_CHUNK_SIZE)) {
    await tx.insert(table).values(batch as never);
  }
}

/* ---------- Export Route ---------- */

const exportQuerySchema = z.object({
  format: z.enum(["json", "excel", "pdf"]).default("json"),
  questionBankId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  type: z.string().optional(),
  difficulty: z.string().optional(),
  search: z.string().optional(),
});

const importExportRoutes: FastifyPluginAsync = async (app) => {
  /* ----- GET /questions/export ----- */
  app.get("/export", async (request, reply) => {
    const parsed = exportQuerySchema.safeParse(request.query);
    if (!parsed.success)
      return reply.code(400).send({ error: "Invalid query parameters" });

    const { format, ...filters } = parsed.data;
    const rows = await fetchQuestionsForExport(filters);

    if (format === "json") {
      return reply
        .header("Content-Type", "application/json")
        .header(
          "Content-Disposition",
          `attachment; filename="questions-export-${Date.now()}.json"`,
        )
        .send(
          JSON.stringify(
            {
              exportedAt: new Date().toISOString(),
              total: rows.length,
              questions: rows,
            },
            null,
            2,
          ),
        );
    }

    if (format === "excel") {
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet("Questions");

      ws.columns = [
        { header: "ID", key: "id", width: 36 },
        { header: "Type", key: "type", width: 18 },
        { header: "Difficulty", key: "difficulty", width: 12 },
        { header: "Marks", key: "marks", width: 8 },
        { header: "Neg. Marks", key: "negativeMarks", width: 10 },
        { header: "Question Text", key: "questionText", width: 60 },
        { header: "Option 1", key: "opt1", width: 30 },
        { header: "Option 2", key: "opt2", width: 30 },
        { header: "Option 3", key: "opt3", width: 30 },
        { header: "Option 4", key: "opt4", width: 30 },
        { header: "Option 5", key: "opt5", width: 30 },
        { header: "Option 6", key: "opt6", width: 30 },
        { header: "Correct Options", key: "correctOpts", width: 18 },
        { header: "Solution", key: "solution", width: 50 },
        { header: "Explanation", key: "explanation", width: 50 },
        { header: "Tags", key: "tags", width: 30 },
        { header: "Estimated Time (s)", key: "estimatedTimeSecs", width: 14 },
        { header: "Active", key: "isActive", width: 8 },
      ];

      ws.getRow(1).font = { bold: true };

      for (const r of rows) {
        const contentText = (r.contentJson?.text as string) ?? "";
        const solutionText = r.solutionJson?.text ?? "";
        const explanation = r.solutionJson?.explanation ?? "";
        const opts = r.options.slice(0, 6);
        const optMap: Record<string, string> = {};
        opts.forEach((o, i) => {
          optMap[`opt${i + 1}`] = o.optionText;
        });
        const correctOpts = opts
          .filter((o) => o.isCorrect)
          .map((o) => o.displayOrder)
          .join(",");

        ws.addRow({
          id: r.id,
          type: r.type,
          difficulty: r.difficulty,
          marks: r.marks,
          negativeMarks: r.negativeMarks,
          questionText: contentText,
          ...optMap,
          correctOpts,
          solution: solutionText,
          explanation,
          tags: r.tags.join(", "),
          estimatedTimeSecs: r.estimatedTimeSecs ?? "",
          isActive: r.isActive ? "Yes" : "No",
        });
      }

      const buffer = await workbook.xlsx.writeBuffer();
      return reply
        .header(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        .header(
          "Content-Disposition",
          `attachment; filename="questions-export-${Date.now()}.xlsx"`,
        )
        .send(Buffer.from(buffer));
    }

    if (format === "pdf") {
      reply.header("Content-Type", "application/pdf");
      reply.header(
        "Content-Disposition",
        `attachment; filename="questions-export-${Date.now()}.pdf"`,
      );

      const doc = new PDFDocument({ margin: 40, size: "A4" });
      doc.pipe(reply.raw);

      doc
        .fontSize(18)
        .font("Helvetica-Bold")
        .text("Question Bank Export", { align: "center" });
      doc
        .fontSize(10)
        .font("Helvetica")
        .text(
          `Exported: ${new Date().toISOString()} | Total: ${rows.length} questions`,
          { align: "center" },
        );
      doc.moveDown(1);

      for (const r of rows) {
        const contentText = (r.contentJson?.text as string) ?? "";

        doc.fontSize(11).font("Helvetica-Bold").text(`Q: ${contentText}`, {
          width: 515,
        });
        doc
          .fontSize(8)
          .font("Helvetica")
          .fillColor("gray")
          .text(
            `Type: ${r.type} | Difficulty: ${r.difficulty} | Marks: ${r.marks} | Neg: ${r.negativeMarks}`,
          );
        doc.fillColor("black");

        if (r.options.length > 0) {
          doc.moveDown(0.3);
          for (const opt of r.options) {
            const marker = opt.isCorrect ? "[✓]" : "[ ]";
            doc
              .fontSize(9)
              .font("Helvetica")
              .text(`  ${marker} ${opt.optionText}`, { width: 500 });
          }
        }

        if (r.solutionJson?.text || r.solutionJson?.explanation) {
          doc.moveDown(0.3);
          if (r.solutionJson.text)
            doc
              .fontSize(9)
              .font("Helvetica-Oblique")
              .text(`Solution: ${r.solutionJson.text}`);
          if (r.solutionJson.explanation)
            doc
              .fontSize(9)
              .font("Helvetica-Oblique")
              .text(`Explanation: ${r.solutionJson.explanation}`);
        }

        if (r.tags.length > 0) {
          doc.moveDown(0.2);
          doc
            .fontSize(8)
            .fillColor("blue")
            .text(`Tags: ${r.tags.join(", ")}`);
          doc.fillColor("black");
        }

        doc.moveDown(0.5);
        doc
          .moveTo(40, doc.y)
          .lineTo(555, doc.y)
          .strokeColor("#cccccc")
          .stroke();
        doc.moveDown(0.5);

        if (doc.y > 780) {
          doc.addPage();
        }
      }

      doc.end();
      return reply;
    }
  });

  /* ----- POST /questions/import ----- */
  app.post("/import", async (request: any, reply) => {
    const file = await request.file();
    if (!file) return reply.code(400).send({ error: "No file uploaded" });

    const fields = file.fields as Record<string, unknown>;
    const questionBankId = (fields.questionBankId as { value?: string })?.value;
    const subjectId = (fields.subjectId as { value?: string })?.value;

    if (!questionBankId || !subjectId)
      return reply
        .code(400)
        .send({ error: "questionBankId and subjectId are required" });

    const filename = file.filename.toLowerCase();
    const ext = filename.split(".").pop();

    let imported = 0;
    let failed = 0;
    const errors: { row: number; error: string }[] = [];

    if (ext === "json") {
      const raw = await file.toBuffer();
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString("utf-8"));
      } catch {
        return reply.code(400).send({ error: "Invalid JSON file" });
      }

      const arr = Array.isArray(parsed)
        ? parsed
        : (parsed as { questions?: unknown[] }).questions;
      if (!Array.isArray(arr))
        return reply
          .code(400)
          .send({ error: "JSON must be an array or { questions: [...] }" });

      interface ParsedItem {
        questionValues: QuestionInsert;
        options: {
          optionText: string;
          isCorrect: boolean;
          displayOrder: number;
        }[];
        tags: string[];
        content: Record<string, unknown>;
      }

      const validItems: ParsedItem[] = [];

      for (let i = 0; i < arr.length; i++) {
        try {
          const item = arr[i] as Record<string, unknown>;
          const content = (item.content ?? {
            text: item.text ?? item.questionText ?? "",
          }) as Record<string, unknown>;
          const opts = Array.isArray(item.options) ? item.options : [];
          const tags = Array.isArray(item.tags) ? item.tags : [];

          validItems.push({
            questionValues: {
              questionBankId,
              subjectId,
              topicId: (item.topicId as string) ?? null,
              type: ((item.type as string) ?? "mcq_single") as "mcq_single",
              difficulty: ((item.difficulty as string) ?? "medium") as "medium",
              cognitiveLevel: ((item.cognitiveLevel as string) ?? null) as
                | "remember"
                | "understand"
                | "apply"
                | "analyze"
                | "evaluate"
                | "create"
                | null,
              marks: String((item.marks as number) ?? 4),
              negativeMarks: String((item.negativeMarks as number) ?? 0),
              estimatedTimeSecs: (item.estimatedTimeSecs as number) ?? null,
              contentJson: content,
              mediaUrlsJson: Array.isArray(item.mediaUrls)
                ? item.mediaUrls
                : null,
              solutionJson: (item.solution as Record<string, unknown>) ?? null,
              createdBy: request.user.sub,
            },
            options: opts.map((o: Record<string, unknown>, idx: number) => ({
              optionText: (o.text as string) ?? "",
              isCorrect: (o.isCorrect as boolean) ?? false,
              displayOrder: (o.displayOrder as number) ?? idx + 1,
            })),
            tags: tags as string[],
            content,
          });
        } catch (err) {
          failed++;
          errors.push({ row: i + 1, error: (err as Error).message });
        }
      }

      if (validItems.length > 0) {
        try {
          await db.transaction(async (tx) => {
            const insertedQuestions = await batchInsertQuestions(
              tx,
              validItems.map((v) => v.questionValues),
            );

            const allOptions: {
              questionId: string;
              optionText: string;
              isCorrect: boolean;
              displayOrder: number;
            }[] = [];
            const allTags: { questionId: string; tag: string }[] = [];
            const allVersions: {
              questionId: string;
              versionNumber: number;
              contentJson: Record<string, unknown>;
              changedBy: string;
              changeReason: string;
            }[] = [];

            insertedQuestions.forEach((q, idx) => {
              const item = validItems[idx];
              for (const opt of item.options) {
                allOptions.push({ questionId: q.id, ...opt });
              }
              for (const tag of item.tags) {
                allTags.push({ questionId: q.id, tag });
              }
              allVersions.push({
                questionId: q.id,
                versionNumber: 1,
                contentJson: item.content,
                changedBy: request.user.sub,
                changeReason: "Bulk import (JSON)",
              });
            });

            await Promise.all([
              allOptions.length > 0
                ? batchInsertChildren(tx, questionOptions, allOptions)
                : null,
              allTags.length > 0
                ? batchInsertChildren(tx, questionTags, allTags)
                : null,
              batchInsertChildren(tx, questionVersions, allVersions),
            ]);

            imported = insertedQuestions.length;
          });
        } catch (err) {
          failed += validItems.length;
          errors.push({
            row: 0,
            error: `Batch insert failed: ${(err as Error).message}`,
          });
        }
      }
    } else if (ext === "xlsx" || ext === "xls") {
      const buf = await file.toBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buf);
      const ws = workbook.getWorksheet(1);
      if (!ws)
        return reply.code(400).send({ error: "Excel file has no worksheets" });

      const headers: string[] = [];
      ws.getRow(1).eachCell((cell, colNumber) => {
        headers[colNumber - 1] = String(cell.value ?? "")
          .toLowerCase()
          .trim();
      });

      const getCol = (row: ExcelJS.Row, name: string): string => {
        const idx = headers.indexOf(name);
        if (idx < 0) return "";
        const cell = row.getCell(idx + 1);
        return String(cell.value ?? "").trim();
      };

      const excelValidItems: {
        questionValues: QuestionInsert;
        options: {
          optionText: string;
          isCorrect: boolean;
          displayOrder: number;
        }[];
        tags: string[];
        content: Record<string, unknown>;
      }[] = [];

      for (let rowIdx = 2; rowIdx <= ws.rowCount; rowIdx++) {
        const row = ws.getRow(rowIdx);
        const questionText =
          getCol(row, "question text") || getCol(row, "question");
        if (!questionText) {
          failed++;
          errors.push({ row: rowIdx, error: "Empty question text" });
          continue;
        }

        try {
          const type = getCol(row, "type") || "mcq_single";
          const difficulty = getCol(row, "difficulty") || "medium";
          const marks = getCol(row, "marks") || "4";
          const negativeMarks =
            getCol(row, "neg. marks") || getCol(row, "negative marks") || "0";
          const solutionText = getCol(row, "solution");
          const explanation = getCol(row, "explanation");
          const tagsStr = getCol(row, "tags");
          const estimatedTime = getCol(row, "estimated time (s)");

          const opts: {
            text: string;
            isCorrect: boolean;
            displayOrder: number;
          }[] = [];
          const correctSet = new Set(
            getCol(row, "correct options")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
              .map(Number),
          );

          for (let oi = 1; oi <= 6; oi++) {
            const optText = getCol(row, `option ${oi}`);
            if (optText) {
              opts.push({
                text: optText,
                isCorrect: correctSet.has(oi),
                displayOrder: oi,
              });
            }
          }

          const content = { text: questionText };
          const solution =
            solutionText || explanation
              ? {
                  text: solutionText || undefined,
                  explanation: explanation || undefined,
                }
              : null;
          const tags = tagsStr
            ? tagsStr
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
            : [];

          excelValidItems.push({
            questionValues: {
              questionBankId,
              subjectId,
              type: type as "mcq_single",
              difficulty: difficulty as "medium",
              marks,
              negativeMarks,
              estimatedTimeSecs: estimatedTime ? parseInt(estimatedTime) : null,
              contentJson: content,
              solutionJson: solution,
              createdBy: request.user.sub,
            },
            options: opts.map((o) => ({
              optionText: o.text,
              isCorrect: o.isCorrect,
              displayOrder: o.displayOrder,
            })),
            tags,
            content,
          });
        } catch (err) {
          failed++;
          errors.push({ row: rowIdx, error: (err as Error).message });
        }
      }

      if (excelValidItems.length > 0) {
        try {
          await db.transaction(async (tx) => {
            const insertedQuestions = await batchInsertQuestions(
              tx,
              excelValidItems.map((v) => v.questionValues),
            );

            const allOptions: {
              questionId: string;
              optionText: string;
              isCorrect: boolean;
              displayOrder: number;
            }[] = [];
            const allTags: { questionId: string; tag: string }[] = [];
            const allVersions: {
              questionId: string;
              versionNumber: number;
              contentJson: Record<string, unknown>;
              changedBy: string;
              changeReason: string;
            }[] = [];

            insertedQuestions.forEach((q, idx) => {
              const item = excelValidItems[idx];
              for (const opt of item.options) {
                allOptions.push({ questionId: q.id, ...opt });
              }
              for (const tag of item.tags) {
                allTags.push({ questionId: q.id, tag });
              }
              allVersions.push({
                questionId: q.id,
                versionNumber: 1,
                contentJson: item.content,
                changedBy: request.user.sub,
                changeReason: "Bulk import (Excel)",
              });
            });

            await Promise.all([
              allOptions.length > 0
                ? batchInsertChildren(tx, questionOptions, allOptions)
                : null,
              allTags.length > 0
                ? batchInsertChildren(tx, questionTags, allTags)
                : null,
              batchInsertChildren(tx, questionVersions, allVersions),
            ]);

            imported = insertedQuestions.length;
          });
        } catch (err) {
          failed += excelValidItems.length;
          errors.push({
            row: 0,
            error: `Batch insert failed: ${(err as Error).message}`,
          });
        }
      }
    } else {
      return reply.code(400).send({
        error: "Unsupported file format. Use .json, .xlsx, or .xls",
      });
    }

    return reply.code(201).send({
      imported,
      failed,
      total: imported + failed,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
    });
  });
};

export default importExportRoutes;
