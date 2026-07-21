import { basename, extname } from "path";
import yauzl from "yauzl";

export interface ExtractedFile {
  filename: string;
  buffer: Buffer<ArrayBufferLike>;
}

export interface ExtractedZip {
  excelFile: ExtractedFile | null;
  jsonFile: ExtractedFile | null;
  images: Map<string, ExtractedFile>;
  allFiles: ExtractedFile[];
}

/**
 * Extract a ZIP buffer and categorize files:
 * - Excel files (.xlsx, .xls)
 * - JSON files (.json)
 * - Image files (.png, .jpg, .jpeg, .gif, .webp, .svg, .bmp)
 */
export function extractZip(zipBuffer: Buffer): Promise<ExtractedZip> {
  return new Promise((resolve, reject) => {
    const images = new Map<string, ExtractedFile>();
    const allFiles: ExtractedFile[] = [];
    let excelFile: ExtractedFile | null = null;
    let jsonFile: ExtractedFile | null = null;

    const imageExtensions = new Set([
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".webp",
      ".svg",
      ".bmp",
    ]);

    yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);
      if (!zipfile) return reject(new Error("Failed to open ZIP file"));

      zipfile.readEntry();

      zipfile.on("entry", (entry) => {
        if (/\/$/.test(entry.fileName)) {
          zipfile.readEntry();
          return;
        }

        zipfile.openReadStream(entry, (err, readStream) => {
          if (err) return reject(err);
          if (!readStream) return reject(new Error("Failed to read entry"));

          const chunks: Buffer[] = [];
          readStream.on("data", (chunk: Buffer) => chunks.push(chunk));
          readStream.on("end", () => {
            const buffer = Buffer.concat(chunks) as Buffer;
            const filename = basename(entry.fileName);
            const ext = extname(filename).toLowerCase();
            const file: ExtractedFile = { filename, buffer };

            allFiles.push(file);

            if (ext === ".xlsx" || ext === ".xls") {
              if (!excelFile) excelFile = file;
            } else if (ext === ".json") {
              if (!jsonFile) jsonFile = file;
            } else if (imageExtensions.has(ext)) {
              images.set(filename, file);
              images.set(entry.fileName, file);
            }

            zipfile.readEntry();
          });
          readStream.on("error", reject);
        });
      });

      zipfile.on("end", () => {
        resolve({ excelFile, jsonFile, images, allFiles });
      });

      zipfile.on("error", reject);
    });
  });
}

/**
 * Resolve an image reference from Excel to an uploaded URL.
 * Handles paths like "images/q1.png", "q1.png", "./images/q1.png"
 */
export function findImage(
  images: Map<string, ExtractedFile>,
  ref: string,
): ExtractedFile | null {
  if (!ref) return null;
  const clean = ref.trim().replace(/^\.\//, "");
  const filename = basename(clean);

  return images.get(clean) ?? images.get(filename) ?? null;
}
