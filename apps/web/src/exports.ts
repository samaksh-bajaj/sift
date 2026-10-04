import {
  displayValue,
  safeSpreadsheetText,
  type Field,
  type Item,
} from '@sift/shared';
function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export async function exportTable(
  format: 'csv' | 'xlsx',
  name: string,
  fields: Field[],
  items: Item[],
) {
  const headers = [
    ...fields.flatMap((f) =>
      f.dataType === 'currency' ? [f.label, `${f.label} currency`] : [f.label],
    ),
    'Source URL',
  ];
  const rows = items.map((i) => [
    ...fields.flatMap((f) => {
      const cell = i.values[f.id];
      const value =
        cell?.value === null || !cell
          ? ''
          : typeof cell.value === 'number'
            ? cell.value
            : displayValue(cell);
      return f.dataType === 'currency'
        ? [value, cell?.currency ?? '']
        : [value];
    }),
    i.sourceUrl,
  ]);
  const filename =
    name.replace(/[^a-z0-9 -]/gi, '').slice(0, 80) || 'comparison';
  if (format === 'csv') {
    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map(
            (v) =>
              `"${(typeof v === 'string' ? safeSpreadsheetText(v) : String(v)).replaceAll('"', '""')}"`,
          )
          .join(','),
      )
      .join('\r\n');
    download(
      new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }),
      `${filename}.csv`,
    );
    return;
  }
  const { Workbook } = await import('exceljs');
  const book = new Workbook();
  const sheet = book.addWorksheet('Comparison');
  sheet.addRow(headers);
  for (const row of rows)
    sheet.addRow(
      row.map((v) => (typeof v === 'string' ? safeSpreadsheetText(v) : v)),
    );
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF172C34' },
  };
  sheet.columns.forEach((c, index) => {
    c.width = index === headers.length - 1 ? 55 : 24;
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: 'A1',
    to: { row: items.length + 1, column: headers.length },
  };
  const buffer = await book.xlsx.writeBuffer();
  download(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `${filename}.xlsx`,
  );
}
