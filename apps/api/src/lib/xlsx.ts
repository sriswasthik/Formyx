import type { Writable } from 'node:stream';
import ExcelJS from 'exceljs';
import type { CsvValue } from './csv.js';

/*
 * Responses as an Excel workbook, streamed: rows are written as they are read, so a large
 * form never sits in memory whole. Text is always written as text, never as a formula, so a
 * respondent typing "=HYPERLINK(...)" gets nothing run (unlike CSV, which needs escaping).
 */

/** Sheet names may not be longer than 31 characters or hold any of : \ / ? * [ ]. */
function sheetName(title: string): string {
  return (
    title
      .replace(/[:\\/?*[\]]/g, ' ')
      .trim()
      .slice(0, 31) || 'Responses'
  );
}

/** Writes `table` to `output` as an .xlsx file: a header row, then a row per response. */
export async function writeWorkbook(
  output: Writable,
  title: string,
  table: { header: string[]; batches: AsyncIterable<CsvValue[][]> },
): Promise<void> {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: output,
    useStyles: true,
    useSharedStrings: false,
  });
  const sheet = workbook.addWorksheet(sheetName(title), {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = table.header.map((header) => ({
    header,
    width: Math.min(40, Math.max(12, header.length + 2)),
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).commit();

  for await (const rows of table.batches) {
    for (const cells of rows) {
      sheet.addRow(cells.map((cell) => (cell === undefined ? null : cell))).commit();
    }
  }
  sheet.commit();
  await workbook.commit();
}
