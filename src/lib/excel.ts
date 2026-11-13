import ExcelJS from "exceljs";
import { createHash } from "node:crypto";
import { AppError } from "./actions";
import type { AppData } from "./types";

export type ImportedRow = {
  pharmacyCode: string;
  pharmacyName: string;
  city: string;
  address: string;
  sku: string;
  productName: string;
  category: string;
  manufacturer: string;
  price: number;
  abc: string;
  xyz: string;
  quantity: number;
  minStock: number;
};

function normalize(value: string) {
  return value.toLowerCase().replaceAll("ё", "е").replace(/[\s_.,:;()№/\\-]/g, "");
}

function cellValue(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("result" in value && value.result !== undefined && value.result !== null) return String(value.result).trim();
    if ("text" in value && value.text) return String(value.text).trim();
    if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("").trim();
  }
  return String(value).trim();
}

const aliases: Record<string, string[]> = {
  pharmacyCode: ["кодаптеки", "кодфилиала", "storecode", "pharmacycode"],
  pharmacyName: ["аптека", "филиал", "Группа отделов", "наименованиеаптеки", "pharmacy", "store"],
  city: ["город", "city"],
  address: ["адрес", "address"],
  sku: ["артикул", "sku", "кодтовара", "штрихкод", "productcode"],
  productName: ["товар", "наименование", "наименованиетовара", "препарат", "названиетовара"],
  category: ["категория", "category"],
  manufacturer: ["производитель", "manufacturer"],
  price: ["цена", "ценаруб", "price"],
  abc: ["abc", "авс", "классabc", "группаabc"],
  xyz: ["xyz", "классxyz", "группаxyz"],
  quantity: ["остаток", "количество", "текущийзапасшт", "колво", "qty", "quantity"],
  minStock: ["минзапас", "минимальныйзапас", "минимум", "minstock"],
};

function columnsFor(row: ExcelJS.Row) {
  const columns: Record<string, number> = {};
  row.eachCell({ includeEmpty: true }, (cell, col) => {
    const heading = normalize(cellValue(cell));
    for (const [key, names] of Object.entries(aliases)) {
      if (names.includes(heading)) columns[key] = col;
    }
  });
  return columns;
}

function numberValue(value: string, field: string, row: number) {
  const cleaned = value.replace(/[\s\u00a0]/g, "").replace(",", ".");
  const parsed = Number(cleaned);
  if (!cleaned || !Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed) || parsed > 10000000) {
    throw new AppError(`Строка ${row}: некорректное значение «${field}»`);
  }
  return parsed;
}

function priceValue(value: string, row: number) {
  const cleaned = value.replace(/[\s\u00a0₽]/g, "").replace(",", ".");
  const parsed = Number(cleaned);
  if (!cleaned || !Number.isFinite(parsed) || parsed < 0 || parsed > 10000000) {
    throw new AppError(`Строка ${row}: некорректное значение «Цена»`);
  }
  return Math.round(parsed);
}

function stableCode(prefix: string, name: string) {
  return `${prefix}-${createHash("sha1").update(name.toLowerCase().trim()).digest("hex").slice(0, 10).toUpperCase()}`;
}

export async function parseExcel(file: File, fallbackPharmacy = ""): Promise<ImportedRow[]> {
  if (!/\.xlsx$/i.test(file.name)) throw new AppError("Загрузите файл в формате .xlsx");
  if (file.size > 10 * 1024 * 1024) throw new AppError("Файл слишком большой. Максимальный размер — 10 МБ");
  if (file.size === 0) throw new AppError("Файл пустой");

  const workbook = new ExcelJS.Workbook();
  try {
    const content = Buffer.from(await file.arrayBuffer());
    await workbook.xlsx.load(content as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw new AppError("Не удалось прочитать Excel-файл. Проверьте формат .xlsx");
  }
  if (!workbook.worksheets.length) throw new AppError("В файле нет листа с данными");
  const rows: ImportedRow[] = [];
  for (const worksheet of workbook.worksheets) {
    const sheetName = worksheet.name.trim();
    const genericSheet = /^(остатки|лист\s*\d*|sheet\s*\d*|data|данные)$/i.test(sheetName);
    const defaultPharmacy = genericSheet ? fallbackPharmacy.trim() : sheetName;
    let headerRow = 0;
    let columns: Record<string, number> = {};
    for (let index = 1; index <= Math.min(worksheet.rowCount, 10); index++) {
      const candidate = columnsFor(worksheet.getRow(index));
      if (candidate.abc && candidate.xyz && candidate.quantity && (candidate.productName || candidate.sku)) {
        if (!candidate.pharmacyName && !candidate.pharmacyCode && !defaultPharmacy) {
          throw new AppError(`Лист «${sheetName}»: нет колонки «Аптека». Укажите название аптеки под областью загрузки.`);
        }
        headerRow = index;
        columns = candidate;
        break;
      }
    }
    if (!headerRow) continue;

    for (let index = headerRow + 1; index <= worksheet.rowCount; index++) {
      const row = worksheet.getRow(index);
      const get = (key: string) => columns[key] ? cellValue(row.getCell(columns[key])) : "";
      const pharmacyName = get("pharmacyName") || defaultPharmacy;
      const pharmacyCode = get("pharmacyCode");
      const productName = get("productName");
      const sku = get("sku");
      const abc = get("abc").toUpperCase().trim().replaceAll("А", "A").replaceAll("В", "B").replaceAll("С", "C");
      const xyz = get("xyz").toUpperCase().trim().replaceAll("Х", "X").replaceAll("У", "Y").replaceAll("З", "Z");
      const quantityText = get("quantity");
      if (![productName, sku, abc, xyz, quantityText].some(Boolean)) continue;
      if ((!pharmacyName && !pharmacyCode) || (!productName && !sku)) throw new AppError(`Лист «${sheetName}», строка ${index}: укажите аптеку и товар`);
      if (!["A", "B", "C"].includes(abc) || !["X", "Y", "Z"].includes(xyz)) {
        throw new AppError(`Лист «${sheetName}», строка ${index}: ABC должен быть A/B/C, а XYZ — X/Y/Z`);
      }
      const quantity = numberValue(quantityText, "Остаток", index);
      const minStockText = get("minStock");
      const priceText = get("price");
      const minStock = minStockText ? numberValue(minStockText, "Мин. запас", index)
        : abc === "A" && xyz === "X" ? quantity + Math.max(8, Math.ceil(quantity * 0.5)) : 0;
      const price = priceText ? priceValue(priceText, index) : 0;
      rows.push({
        pharmacyCode: (pharmacyCode || stableCode("АП", pharmacyName)).slice(0, 40),
        pharmacyName: (pharmacyName || pharmacyCode).slice(0, 160),
        city: get("city").slice(0, 100),
        address: get("address").slice(0, 1000),
        sku: (sku || stableCode("PRD", productName)).slice(0, 60),
        productName: (productName || sku).slice(0, 200),
        category: (get("category") || "Другое").slice(0, 100),
        manufacturer: get("manufacturer").slice(0, 120),
        price,
        abc, xyz, quantity, minStock,
      });
      if (rows.length > 3000) throw new AppError("В одном файле можно загрузить не более 3000 строк");
    }
  }
  if (!rows.length) throw new AppError("Не найдены строки с данными. Нужны колонки: Товар (или Артикул), ABC, XYZ, Остаток и Аптека (или название листа).");
  return rows;
}

function styleSheet(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1);
  header.height = 32;
  header.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  header.alignment = { vertical: "middle" };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF163140" } };
    cell.border = { bottom: { style: "medium", color: { argb: "FF16A890" } } };
  });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.height = 25;
    if (rowNumber % 2 === 0) row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F8F8" } };
    });
  });
}

export async function makeExcel(data: AppData | null, template = false): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ФармаБаланс";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Остатки", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "Код аптеки", key: "pharmacyCode", width: 17 },
    { header: "Аптека", key: "pharmacyName", width: 28 },
    { header: "Город", key: "city", width: 17 },
    { header: "Адрес", key: "address", width: 34 },
    { header: "Артикул", key: "sku", width: 21 },
    { header: "Товар", key: "productName", width: 37 },
    { header: "Категория", key: "category", width: 22 },
    { header: "Производитель", key: "manufacturer", width: 24 },
    { header: "ABC", key: "abc", width: 11 },
    { header: "XYZ", key: "xyz", width: 11 },
    { header: "Остаток", key: "quantity", width: 15 },
    { header: "Мин. запас", key: "minStock", width: 17 },
    { header: "Цена", key: "price", width: 15 },
  ];

  if (!template && data) {
    const stores = new Map(data.pharmacies.map((item) => [item.id, item]));
    const catalog = new Map(data.products.map((item) => [item.id, item]));
    for (const item of data.inventory) {
      const store = stores.get(item.pharmacyId);
      const product = catalog.get(item.productId);
      sheet.addRow({
        pharmacyCode: store?.code ?? "", pharmacyName: store?.name ?? "", city: store?.city ?? "",
        address: store?.address ?? "", sku: product?.sku ?? "", productName: product?.name ?? "",
        category: product?.category ?? "", manufacturer: product?.manufacturer ?? "",
        abc: item.abc, xyz: item.xyz, quantity: item.quantity, minStock: item.minStock, price: product?.price ?? 0,
      });
    }
  }
  styleSheet(sheet);
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const isDonor = row.getCell(9).value === "C" && row.getCell(10).value === "Z";
    const isReceiver = row.getCell(9).value === "A" && row.getCell(10).value === "X";
    if (isDonor || isReceiver) {
      const color = isDonor ? "FFFFE9E5" : "FFDDF5EE";
      for (const col of [9, 10]) {
        row.getCell(col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
        row.getCell(col).font = { bold: true, color: { argb: isDonor ? "FFB96B58" : "FF138C76" } };
      }
    }
  }

  if (template) {
    const help = workbook.addWorksheet("Инструкция");
    help.columns = [{ header: "Как заполнить файл", key: "instruction", width: 105 }];
    [
      "Одна строка = один товар в одной аптеке. Шаблон пустой: заполните его своими данными.",
      "Обязательные столбцы: Товар (или Артикул), ABC, XYZ, Остаток. Для нескольких аптек добавьте колонку Аптека.",
      "Если колонка Аптека отсутствует, назовите лист именем аптеки или укажите название на экране импорта.",
      "Используйте один и тот же артикул для одного товара в разных аптеках.",
      "Из аптеки с ABC=C и XYZ=Z товар предлагается переместить в аптеку с ABC=A и XYZ=X.",
      "Мин. запас необязателен. Для A/X система рассчитает ориентир автоматически, если поле пустое.",
      "Повторная загрузка заменит все текущие остатки аптек, присутствующих в файле. Другие аптеки не изменятся.",
      "Каждый импорт сохраняет число строк, общий объём товара и срез матрицы ABC/XYZ по каждой аптеке.",
    ].forEach((instruction) => help.addRow({ instruction }));
    styleSheet(help);
  } else if (data) {
    const stores = new Map(data.pharmacies.map((item) => [item.id, item]));
    const catalog = new Map(data.products.map((item) => [item.id, item]));
    const recSheet = workbook.addWorksheet("Рекомендации", { views: [{ state: "frozen", ySplit: 1 }] });
    recSheet.columns = [
      { header: "Артикул", key: "sku", width: 20 }, { header: "Товар", key: "product", width: 38 },
      { header: "Откуда (C/Z)", key: "from", width: 29 }, { header: "Куда (A/X)", key: "to", width: 29 },
      { header: "Количество", key: "quantity", width: 17 }, { header: "Стоимость, ₽", key: "value", width: 20 },
    ];
    data.recommendations.forEach((rec) => recSheet.addRow({
      sku: catalog.get(rec.productId)?.sku ?? "", product: catalog.get(rec.productId)?.name ?? "",
      from: stores.get(rec.fromPharmacyId)?.name ?? "", to: stores.get(rec.toPharmacyId)?.name ?? "",
      quantity: rec.quantity, value: rec.value,
    }));
    styleSheet(recSheet);

    const transferSheet = workbook.addWorksheet("Перемещения", { views: [{ state: "frozen", ySplit: 1 }] });
    transferSheet.columns = [
      { header: "Дата", key: "date", width: 21 }, { header: "Артикул", key: "sku", width: 20 },
      { header: "Товар", key: "product", width: 38 }, { header: "Откуда", key: "from", width: 29 },
      { header: "Куда", key: "to", width: 29 }, { header: "Количество", key: "quantity", width: 17 },
      { header: "Статус", key: "status", width: 18 }, { header: "Комментарий", key: "note", width: 38 },
    ];
    data.transfers.forEach((item) => transferSheet.addRow({
      date: new Date(item.createdAt).toLocaleString("ru-RU"), sku: catalog.get(item.productId)?.sku ?? "",
      product: catalog.get(item.productId)?.name ?? "", from: stores.get(item.fromPharmacyId)?.name ?? "",
      to: stores.get(item.toPharmacyId)?.name ?? "", quantity: item.quantity,
      status: item.status === "completed" ? "Выполнено" : item.status === "cancelled" ? "Отменено" : "Запланировано",
      note: item.note,
    }));
    styleSheet(transferSheet);

    const matrixSheet = workbook.addWorksheet("Матрица ABC-XYZ", { views: [{ state: "frozen", ySplit: 1 }] });
    matrixSheet.columns = [
      { header: "Код аптеки", key: "code", width: 17 }, { header: "Аптека", key: "pharmacy", width: 30 },
      { header: "ABC", key: "abc", width: 12 }, { header: "XYZ", key: "xyz", width: 12 },
      { header: "Позиций", key: "positions", width: 16 }, { header: "Упаковок", key: "units", width: 18 },
    ];
    for (const store of data.pharmacies) {
      for (const abc of ["A", "B", "C"]) for (const xyz of ["X", "Y", "Z"]) {
        const matching = data.inventory.filter((item) => item.pharmacyId === store.id && item.abc === abc && item.xyz === xyz);
        matrixSheet.addRow({ code: store.code, pharmacy: store.name, abc, xyz,
          positions: matching.length, units: matching.reduce((sum, item) => sum + item.quantity, 0) });
      }
    }
    styleSheet(matrixSheet);

    const historySheet = workbook.addWorksheet("История загрузок", { views: [{ state: "frozen", ySplit: 1 }] });
    historySheet.columns = [
      { header: "Дата", key: "date", width: 23 }, { header: "Файл", key: "filename", width: 42 },
      { header: "Аптек", key: "pharmacies", width: 15 }, { header: "Позиций", key: "positions", width: 17 },
      { header: "Упаковок", key: "units", width: 19 }, { header: "Размер, байт", key: "size", width: 20 },
    ];
    data.imports.forEach((item) => historySheet.addRow({
      date: new Date(item.createdAt).toLocaleString("ru-RU"), filename: item.filename,
      pharmacies: item.pharmaciesCount, positions: item.rowsImported,
      units: item.totalUnits, size: item.fileSize,
    }));
    styleSheet(historySheet);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
