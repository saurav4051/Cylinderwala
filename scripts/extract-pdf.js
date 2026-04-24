import fs from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "../node_modules/.pnpm/pdf-parse@2.4.5/node_modules/pdf-parse/dist/pdf-parse/esm/index.js";

const pdfPath = process.argv[2] ?? "C:\\Users\\saura\\Downloads\\Cylendra Wala.pdf";
const outputPath =
  process.argv[3] ?? path.resolve("docs", "requirements-from-pdf.txt");

const buffer = await fs.readFile(pdfPath);
const parser = new PDFParse({ data: buffer });
const result = await parser.getText();

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, result.text, "utf8");
await parser.destroy();

console.log(`Extracted text to ${outputPath}`);
