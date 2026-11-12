"use client";

import { useState } from "react";
import { ArrowRight, ArrowUpRight, Building2, Database, FileSpreadsheet, Layers3, Package, Sparkles, UploadCloud } from "lucide-react";
import type { AppData, InventoryItem, MatrixSnapshot, Pharmacy } from "@/lib/types";

const abcGrades = ["A", "B", "C"] as const;
const xyzGrades = ["X", "Y", "Z"] as const;
const format = new Intl.NumberFormat("ru-RU");
const formatDate = (value: string) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
const formatSize = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1).replace(".", ",")} МБ` : `${Math.max(1, Math.round(bytes / 1024))} КБ`;

type MatrixCell = { abc: string; xyz: string; positions: number; units: number };

function sumCells(rows: Array<InventoryItem | MatrixSnapshot>): MatrixCell[] {
  const cells = new Map<string, MatrixCell>();
  for (const row of rows) {
    const key = `${row.abc}${row.xyz}`;
    const current = cells.get(key) ?? { abc: row.abc, xyz: row.xyz, positions: 0, units: 0 };
    current.positions += "positions" in row ? row.positions : 1;
    current.units += "units" in row ? row.units : row.quantity;
    cells.set(key, current);
  }
  return [...cells.values()];
}

export default function MatrixView({ data, onImport, onInventory }: {
  data: AppData;
  onImport: () => void;
  onInventory: (pharmacyId: number | "all", abc: string, xyz: string) => void;
}) {
  const [batchId, setBatchId] = useState("current");
  const [selectedPharmacy, setSelectedPharmacy] = useState("all");
  const batch = data.imports.find((item) => String(item.id) === batchId);
  const historical = Boolean(batch);
  const sourceRows = historical
    ? data.matrixSnapshots.filter((item) => item.batchId === batch!.id)
    : data.inventory;
  const availableStores = historical
    ? data.pharmacies.filter((store) => sourceRows.some((row) => row.pharmacyId === store.id))
    : data.pharmacies;
  const pharmacyId = availableStores.some((store) => String(store.id) === selectedPharmacy) ? selectedPharmacy : "all";
  const visibleRows = pharmacyId === "all" ? sourceRows : sourceRows.filter((row) => row.pharmacyId === Number(pharmacyId));
  const cells = sumCells(visibleRows);
  const cellMap = new Map(cells.map((cell) => [`${cell.abc}${cell.xyz}`, cell]));
  const totalPositions = cells.reduce((sum, cell) => sum + cell.positions, 0);
  const totalUnits = cells.reduce((sum, cell) => sum + cell.units, 0);
  const activeStores = pharmacyId === "all" ? availableStores.length : 1;
  const lastImport = data.imports.find((item) => pharmacyId === "all"
    || data.matrixSnapshots.some((snapshot) => snapshot.batchId === item.id && snapshot.pharmacyId === Number(pharmacyId)));
  const byGrade = abcGrades.map((grade) => ({ grade, positions: cells.filter((cell) => cell.abc === grade).reduce((sum, cell) => sum + cell.positions, 0) }));
  const ax = cellMap.get("AX")?.positions ?? 0;
  const cz = cellMap.get("CZ")?.positions ?? 0;

  function pharmacySummary(store: Pharmacy) {
    const rows = sourceRows.filter((row) => row.pharmacyId === store.id);
    const grouped = sumCells(rows);
    return {
      positions: grouped.reduce((sum, cell) => sum + cell.positions, 0),
      units: grouped.reduce((sum, cell) => sum + cell.units, 0),
      ax: grouped.find((cell) => cell.abc === "A" && cell.xyz === "X")?.positions ?? 0,
      cz: grouped.find((cell) => cell.abc === "C" && cell.xyz === "Z")?.positions ?? 0,
    };
  }

  return <>
    <div className="page-heading"><div><div className="page-kicker"><span className="kicker-dot" />АНАЛИТИКА СЕТИ</div><h1>Матрица ABC/XYZ</h1><p>Аптеки, классы товаров и объём запасов — на основе загруженных Excel-файлов.</p></div><div className="page-actions"><button className="btn btn-primary" onClick={onImport}><UploadCloud size={17} />Загрузить Excel</button></div></div>
    {!data.imports.length ? <section className="surface matrix-empty"><div className="matrix-empty-art" aria-hidden="true">{abcGrades.flatMap((a) => xyzGrades.map((x) => <span key={`${a}${x}`} />))}</div><div className="matrix-empty-copy"><div className="matrix-empty-badge"><Sparkles size={15} />ДАННЫХ ПОКА НЕТ</div><h2>Ваша матрица появится здесь</h2><p>Загрузите Excel с остатками, ABC и XYZ. Мы сохраним каждую аптеку, рассчитаем количество позиций и упаковок в девяти группах и запомним срез каждой загрузки.</p><button className="btn btn-primary" onClick={onImport}><UploadCloud size={17} />Загрузить первый файл</button></div></section> : <>
      <div className="matrix-toolbar surface"><div className="matrix-select-wrap"><label htmlFor="matrix-batch">Срез данных</label><select id="matrix-batch" value={batchId} onChange={(event) => { setBatchId(event.target.value); setSelectedPharmacy("all"); }}><option value="current">Текущие остатки</option>{data.imports.map((item) => <option key={item.id} value={item.id}>{formatDate(item.createdAt)} · {item.filename}</option>)}</select></div><div className="matrix-select-wrap"><label htmlFor="matrix-store">Аптека</label><select id="matrix-store" value={pharmacyId} onChange={(event) => setSelectedPharmacy(event.target.value)}><option value="all">Вся сеть · {availableStores.length} аптек</option>{availableStores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></div><span className="matrix-source-indicator"><span />{historical ? "Сохранённый срез" : "Актуальные данные"}</span></div>
      <div className="matrix-metrics"><div className="matrix-metric"><span className="matrix-metric-icon blue"><Building2 size={19} /></span><div><small>Аптек в выборке</small><strong>{format.format(activeStores)}</strong></div></div><div className="matrix-metric"><span className="matrix-metric-icon mint"><Layers3 size={19} /></span><div><small>Товарных позиций</small><strong>{format.format(totalPositions)}</strong></div></div><div className="matrix-metric"><span className="matrix-metric-icon amber"><Package size={19} /></span><div><small>Всего упаковок</small><strong>{format.format(totalUnits)}</strong></div></div><div className="matrix-metric"><span className="matrix-metric-icon purple"><Database size={19} /></span><div><small>Сохранено файлов</small><strong>{format.format(data.imports.length)}</strong></div></div></div>
      <div className="matrix-layout"><section className="surface matrix-board"><div className="matrix-board-heading"><div><h2>Распределение товаров</h2><p>{pharmacyId === "all" ? "Все аптеки сети" : availableStores.find((store) => String(store.id) === pharmacyId)?.name} · {historical ? `срез от ${formatDate(batch!.createdAt)}` : "текущие остатки"}</p></div><span className="matrix-board-total">{format.format(totalPositions)} позиций</span></div>
        <div className="matrix-axis-label"><span>ABC ↓ &nbsp; XYZ →</span><strong>X <small>стабильный</small></strong><strong>Y <small>средний</small></strong><strong>Z <small>нерегулярный</small></strong></div>
        <div className="matrix-cells">{abcGrades.map((abc) => <div className="matrix-row" key={abc}><div className="matrix-row-label"><strong>{abc}</strong><small>{abc === "A" ? "высокая" : abc === "B" ? "средняя" : "низкая"}<br />ценность</small></div>{xyzGrades.map((xyz) => { const cell = cellMap.get(`${abc}${xyz}`); const positions = cell?.positions ?? 0; const units = cell?.units ?? 0; return <button key={`${abc}${xyz}`} type="button" className={`matrix-cell matrix-cell--${abc.toLowerCase()}${xyz.toLowerCase()} ${!positions ? "matrix-cell--empty" : ""}`} disabled={historical || !positions} title={historical ? "Исторический срез доступен только для просмотра" : `Показать товары класса ${abc}/${xyz}`} onClick={() => onInventory(pharmacyId === "all" ? "all" : Number(pharmacyId), abc, xyz)}><span className="matrix-cell-code">{abc}/{xyz}</span><strong>{format.format(positions)}</strong><span className="matrix-cell-caption">{positions === 1 ? "позиция" : "позиций"}</span><span className="matrix-cell-footer">{format.format(units)} шт. {!historical && positions > 0 && <ArrowUpRight size={14} />}</span></button>; })}</div>)}</div>
        <div className="matrix-board-foot"><span><i className="matrix-legend-dot ax" />A/X · высокий стабильный спрос</span><span><i className="matrix-legend-dot cz" />C/Z · низкий нерегулярный спрос</span>{!historical && <span className="matrix-hint">Нажмите на ячейку, чтобы увидеть товары</span>}</div>
      </section><aside className="matrix-aside"><section className="surface matrix-insight"><div className="matrix-aside-heading"><div className="matrix-aside-icon"><Layers3 size={18} /></div><h2>Структура ABC</h2></div><p>Доля позиций по ценности товара</p><div className="matrix-bars">{byGrade.map(({ grade, positions }) => <div className="matrix-bar-row" key={grade}><span>{grade}</span><div className="matrix-bar-track"><div className={`matrix-bar-fill matrix-bar-fill--${grade.toLowerCase()}`} style={{ width: `${totalPositions ? positions / totalPositions * 100 : 0}%` }} /></div><strong>{positions}</strong></div>)}</div><div className="matrix-insight-footer"><span>Последняя загрузка</span><strong>{lastImport ? formatDate(lastImport.createdAt) : "—"}</strong></div></section><section className="matrix-focus-card"><div className="focus-icon"><Sparkles size={19} /></div><h3>Фокус перераспределения</h3><p>Сопоставьте одинаковые товары из группы <b>C/Z</b> одной аптеки с группой <b>A/X</b> другой.</p><div className="focus-stats"><span><strong>{cz}</strong> позиций C/Z</span><ArrowRight size={17} /><span><strong>{ax}</strong> позиций A/X</span></div></section></aside></div>
      <section className="surface matrix-store-section"><div className="section-header"><div><h2>Аптеки в {historical ? "этом срезе" : "сети"}</h2><p>Сохранённые данные и объём товаров по каждой аптеке</p></div><span className="count-badge">{availableStores.length}</span></div><div className="table-scroll"><table className="data-table matrix-store-table"><thead><tr><th>АПТЕКА</th><th>ПОЗИЦИЙ</th><th>УПАКОВОК</th><th>A / X</th><th>C / Z</th><th className="align-right">МАТРИЦА</th></tr></thead><tbody>{availableStores.map((store) => { const summary = pharmacySummary(store); return <tr key={store.id}><td><div className="matrix-store-name"><span><Building2 size={18} /></span><div><strong>{store.name}</strong><small>{store.code}{store.city ? ` · ${store.city}` : ""}</small></div></div></td><td className="stock-number">{format.format(summary.positions)}</td><td className="stock-number">{format.format(summary.units)} шт.</td><td><span className="grade-tag grade-tag--ax">{summary.ax}</span></td><td><span className="grade-tag grade-tag--cz">{summary.cz}</span></td><td className="align-right"><button className="row-action" onClick={() => { setSelectedPharmacy(String(store.id)); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Смотреть <ArrowRight size={15} /></button></td></tr>; })}</tbody></table></div></section>
      <section className="surface matrix-archive-section"><div className="section-header"><div><h2>Архив загрузок</h2><p>Исторические матрицы сохраняются и не меняются после новых импортов</p></div><span className="count-badge">{data.imports.length}</span></div><div className="table-scroll"><table className="data-table matrix-archive-table"><thead><tr><th>ФАЙЛ</th><th>ДАТА</th><th>АПТЕК</th><th>ПОЗИЦИЙ</th><th>УПАКОВОК</th><th>РАЗМЕР</th><th className="align-right">СНИМОК</th></tr></thead><tbody>{data.imports.map((item) => <tr key={item.id}><td><div className="matrix-file-name"><FileSpreadsheet size={18} /><strong>{item.filename}</strong></div></td><td className="muted-cell">{formatDate(item.createdAt)}</td><td className="stock-number">{item.pharmaciesCount}</td><td className="stock-number">{format.format(item.rowsImported)}</td><td className="stock-number">{format.format(item.totalUnits)} шт.</td><td className="muted-cell">{formatSize(item.fileSize)}</td><td className="align-right"><button className="row-action" onClick={() => { setBatchId(String(item.id)); setSelectedPharmacy("all"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Открыть <ArrowRight size={15} /></button></td></tr>)}</tbody></table></div></section>
    </>}
  </>;
}
