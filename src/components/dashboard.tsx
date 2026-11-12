"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  Activity, ArrowLeftRight, ArrowRight, ArrowUpRight, Bell, Building2, Check,
  CheckCircle2, ChevronLeft, ChevronRight, CircleHelp, Clock3, Download,
  FileSpreadsheet, FileUp, Grid3X3, LayoutDashboard, Loader2, MapPin, Menu, Package,
  PackageCheck, PackageSearch, Pencil, Pill, Plus, RotateCw, Search, ShieldCheck,
  Sparkles, Trash2, TrendingUp, UploadCloud, X, AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { buildRecommendations } from "@/lib/recommendations";
import type { AppData, Product, Recommendation, Transfer, View } from "@/lib/types";
import { EditorModal, type EditorModalState } from "./editor-modal";
import MatrixView from "./matrix-view";
import EmptyWorkspace from "./empty-workspace";

type ConfirmModalState = {
  kind: "confirm";
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<boolean>;
};
type ModalState = EditorModalState | ConfirmModalState;
type ToastState = { message: string; kind: "success" | "error" };

type NavItem = { id: View; label: string; icon: LucideIcon };
const mainNav: NavItem[] = [
  { id: "overview", label: "Обзор", icon: LayoutDashboard },
  { id: "matrix", label: "Матрица ABC/XYZ", icon: Grid3X3 },
  { id: "recommendations", label: "Рекомендации", icon: Sparkles },
  { id: "inventory", label: "Остатки", icon: Package },
  { id: "transfers", label: "Перемещения", icon: ArrowLeftRight },
];
const managementNav: NavItem[] = [
  { id: "pharmacies", label: "Аптеки", icon: Building2 },
  { id: "products", label: "Каталог товаров", icon: Pill },
  { id: "import", label: "Импорт Excel", icon: FileSpreadsheet },
];
const pageLabels: Record<View, string> = {
  overview: "Обзор", matrix: "Матрица ABC/XYZ", recommendations: "Рекомендации", inventory: "Остатки",
  transfers: "Перемещения", pharmacies: "Аптеки", products: "Каталог товаров", import: "Импорт Excel",
};
const nf = new Intl.NumberFormat("ru-RU");
const money = (value: number) => `${nf.format(value)} ₽`;
const fileSize = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1).replace(".", ",")} МБ` : `${Math.max(1, Math.round(bytes / 1024))} КБ`;
const shortDate = (value: string) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
const fullDate = (value: string) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
const storeShort = (name?: string) => name?.replace(/^Аптека на /, "") ?? "Аптека";
const statusLabel = (status: string) => status === "completed" ? "Выполнено" : status === "cancelled" ? "Отменено" : "Запланировано";

function ProductCell({ product, subtitle }: { product?: Product; subtitle?: string }) {
  return <div className="product-cell">
    <div className="product-icon"><Pill size={19} strokeWidth={1.8} /></div>
    <div className="product-cell-text"><strong>{product?.name ?? "Товар удалён"}</strong><span>{subtitle ?? product?.sku ?? "—"}</span></div>
  </div>;
}

function EmptyState({ icon: Icon = PackageSearch, title, description, action, onAction }: {
  icon?: LucideIcon; title: string; description: string; action?: string; onAction?: () => void;
}) {
  return <div className="empty-state">
    <div className="empty-icon"><Icon size={27} strokeWidth={1.7} /></div>
    <h3>{title}</h3><p>{description}</p>
    {action && onAction && <button className="btn btn-primary btn-small" onClick={onAction}><Plus size={16} />{action}</button>}
  </div>;
}

function StatCard({ label, value, caption, icon: Icon, tone, detail }: {
  label: string; value: string; caption: string; icon: LucideIcon; tone: string; detail?: string;
}) {
  return <div className="stat-card">
    <div className="stat-card-top"><span className="stat-label">{label}</span><div className={`stat-icon stat-icon--${tone}`}><Icon size={21} strokeWidth={1.9} /></div></div>
    <div className="stat-value">{value}</div>
    <div className="stat-bottom"><span className="stat-caption">{caption}</span>{detail && <span className="stat-detail"><ArrowUpRight size={13} />{detail}</span>}</div>
  </div>;
}

function PageHeading({ kicker, title, description, children }: { kicker: string; title: string; description: string; children?: React.ReactNode }) {
  return <div className="page-heading">
    <div><div className="page-kicker"><span className="kicker-dot" />{kicker}</div><h1>{title}</h1><p>{description}</p></div>
    {children && <div className="page-actions">{children}</div>}
  </div>;
}

function SearchInput({ value, onChange, placeholder = "Поиск..." }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <div className="search-field"><Search size={18} strokeWidth={1.9} /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label="Поиск" />{value && <button aria-label="Очистить поиск" onClick={() => onChange("")}><X size={15} /></button>}</div>;
}

function Pagination({ page, pages, onChange, total }: { page: number; pages: number; onChange: (page: number) => void; total: number }) {
  if (total === 0) return null;
  return <div className="pagination"><span>Показано {Math.min((page - 1) * 10 + 1, total)}–{Math.min(page * 10, total)} из {total}</span>
    <div className="pagination-buttons"><button disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Предыдущая страница"><ChevronLeft size={17} /></button><span>{page} / {pages}</span><button disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Следующая страница"><ChevronRight size={17} /></button></div>
  </div>;
}

function optimisticallyRemoveTransfer(current: AppData, id: number): AppData {
  const transfers = current.transfers.filter((item) => item.id !== id);
  return { ...current, transfers, recommendations: buildRecommendations(current.inventory, current.products, transfers) };
}

export default function Dashboard({ initialData, initialView }: { initialData: AppData; initialView: View }) {
  const [data, setData] = useState<AppData>(initialData);
  const [view, setView] = useState<View>(initialView);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [search, setSearch] = useState("");
  const [pharmacyFilter, setPharmacyFilter] = useState("all");
  const [abcFilter, setAbcFilter] = useState("all");
  const [xyzFilter, setXyzFilter] = useState("all");
  const [transferFilter, setTransferFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [importResult, setImportResult] = useState<{ rows: number; pharmacies: number; units: number } | null>(null);
  const [importPharmacyName, setImportPharmacyName] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const stores = useMemo(() => new Map(data.pharmacies.map((item) => [item.id, item])), [data.pharmacies]);
  const catalog = useMemo(() => new Map(data.products.map((item) => [item.id, item])), [data.products]);
  const recommendedValue = data.recommendations.reduce((sum, item) => sum + item.value, 0);
  const totalStock = data.inventory.reduce((sum, item) => sum + item.quantity, 0);
  const gradeCounts = {
    A: data.inventory.filter((item) => item.abc === "A").length,
    B: data.inventory.filter((item) => item.abc === "B").length,
    C: data.inventory.filter((item) => item.abc === "C").length,
  };
  const totalPositions = data.inventory.length || 1;
  const aPercent = Math.round(gradeCounts.A / totalPositions * 100);
  const bPercent = Math.round(gradeCounts.B / totalPositions * 100);

  useEffect(() => {
    const onPopState = () => {
      const next = new URLSearchParams(window.location.search).get("view");
      if (next && next in pageLabels) setView(next as View);
      else setView("overview");
      setSearch(""); setPage(1);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4300);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) { setModal(null); setMobileMenu(false); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy]);

  function navigate(next: View) {
    setView(next); setMobileMenu(false); setSearch(""); setPage(1);
    setPharmacyFilter("all"); setAbcFilter("all"); setXyzFilter("all"); setTransferFilter("all");
    const url = next === "overview" ? "/" : `/?view=${next}`;
    window.history.pushState({}, "", url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function refreshData() {
    setRefreshing(true);
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Не удалось обновить данные");
      setData(result as AppData);
      setToast({ message: "Данные обновлены", kind: "success" });
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Ошибка загрузки", kind: "error" });
    } finally { setRefreshing(false); }
  }

  async function runAction(type: string, payload: Record<string, unknown> = {}, id?: number, success = "Изменения сохранены", optimistic?: (current: AppData) => AppData): Promise<boolean> {
    if (busy) return false;
    const previous = data;
    if (optimistic) setData(optimistic(previous));
    setBusy(true);
    try {
      const response = await fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, id, data: payload }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Не удалось сохранить изменения");
      setData(result.data as AppData);
      setModal(null);
      setToast({ message: success, kind: "success" });
      return true;
    } catch (error) {
      if (optimistic) setData(previous);
      setToast({ message: error instanceof Error ? error.message : "Ошибка сохранения", kind: "error" });
      return false;
    } finally { setBusy(false); }
  }

  async function saveEditor(values: Record<string, string>): Promise<boolean> {
    if (!modal || modal.kind === "confirm") return false;
    const { kind, item } = modal;
    const type = `${kind}.${item ? "update" : "create"}`;
    return runAction(type, values, item?.id, item ? "Изменения сохранены" : kind === "transfer" ? "Перемещение запланировано" : "Запись добавлена");
  }

  function askDelete(item: Transfer) {
    setModal({
      kind: "confirm", title: "Удалить перемещение?",
      description: `План для товара «${catalog.get(item.productId)?.name ?? "Товар"}» будет удалён без возможности восстановления. Остатки аптек не изменятся.`,
      confirmLabel: "Удалить", danger: true,
      onConfirm: () => runAction("transfer.delete", {}, item.id, "План удалён", (current) => optimisticallyRemoveTransfer(current, item.id)),
    });
  }

  function completeMovement(item: Transfer) {
    setModal({
      kind: "confirm", title: "Подтвердить перемещение?",
      description: `${nf.format(item.quantity)} шт. товара «${catalog.get(item.productId)?.name ?? "Товар"}» будут списаны из ${stores.get(item.fromPharmacyId)?.name ?? "аптеки"} и зачислены в ${stores.get(item.toPharmacyId)?.name ?? "аптеку"}. Остатки обновятся сразу.`,
      confirmLabel: "Завершить перемещение",
      onConfirm: () => runAction("transfer.update", { status: "completed" }, item.id, "Перемещение выполнено, остатки обновлены", (current) => {
        let hasTarget = false;
        const inventory = current.inventory.map((stock) => {
          if (stock.productId === item.productId && stock.pharmacyId === item.fromPharmacyId) return { ...stock, quantity: stock.quantity - item.quantity };
          if (stock.productId === item.productId && stock.pharmacyId === item.toPharmacyId) { hasTarget = true; return { ...stock, quantity: stock.quantity + item.quantity }; }
          return stock;
        });
        if (!hasTarget) inventory.push({ id: -Date.now(), pharmacyId: item.toPharmacyId, productId: item.productId, quantity: item.quantity, minStock: 0, abc: "B", xyz: "Y", updatedAt: new Date().toISOString() });
        const transfers = current.transfers.map((movement) => movement.id === item.id ? { ...movement, status: "completed", completedAt: new Date().toISOString() } : movement);
        return { ...current, inventory, transfers, recommendations: buildRecommendations(inventory, current.products, transfers) };
      }),
    });
  }

  function cancelMovement(item: Transfer) {
    setModal({
      kind: "confirm", title: "Отменить перемещение?",
      description: "План будет отмечен как отменённый. Остатки аптек не изменятся.",
      confirmLabel: "Отменить перемещение", danger: true,
      onConfirm: () => runAction("transfer.update", { status: "cancelled" }, item.id, "Перемещение отменено", (current) => {
        const transfers = current.transfers.map((movement) => movement.id === item.id ? { ...movement, status: "cancelled" } : movement);
        return { ...current, transfers, recommendations: buildRecommendations(current.inventory, current.products, transfers) };
      }),
    });
  }

  async function uploadFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".xlsx")) { setToast({ message: "Выберите файл в формате .xlsx", kind: "error" }); return; }
    setUploading(true); setImportResult(null);
    try {
      const body = new FormData(); body.append("file", file);
      if (importPharmacyName.trim()) body.append("pharmacyName", importPharmacyName.trim());
      const response = await fetch("/api/import", { method: "POST", body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Не удалось загрузить файл");
      setData(result.data as AppData);
      setImportResult({ rows: result.imported as number, pharmacies: result.pharmacies as number, units: result.units as number });
      setToast({ message: `Сохранено ${nf.format(result.imported)} позиций в ${nf.format(result.pharmacies)} аптеках.`, kind: "success" });
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Ошибка импорта", kind: "error" });
    } finally { setUploading(false); if (fileInput.current) fileInput.current.value = ""; }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault(); setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void uploadFile(file);
  }

  function recommendationTable(items: Recommendation[], compact = false) {
    if (items.length === 0) return <EmptyState icon={PackageCheck} title={data.inventory.length ? "Совпадений пока нет" : "Загрузите данные аптек"} description={data.inventory.length ? "Среди загруженных товаров не найдено пары C/Z → A/X. Обновите остатки новым файлом." : "После импорта Excel здесь появятся рекомендации по перемещению товаров."} action="Загрузить Excel" onAction={() => navigate("import")} />;
    return <div className="table-scroll"><table className={`data-table recommendation-table ${compact ? "table-compact" : ""}`}>
      <thead><tr><th>ТОВАР</th><th>ОТКУДА</th><th>КУДА</th><th>ОБЪЁМ</th>{!compact && <th>СТОИМОСТЬ</th>}<th className="align-right">ДЕЙСТВИЕ</th></tr></thead>
      <tbody>{items.map((rec) => <tr key={rec.key}>
        <td><ProductCell product={catalog.get(rec.productId)} /></td>
        <td><div className="branch-cell"><strong>{storeShort(stores.get(rec.fromPharmacyId)?.name)}</strong><span className="grade-tag grade-tag--cz">C / Z</span></div></td>
        <td><div className="branch-cell"><strong>{storeShort(stores.get(rec.toPharmacyId)?.name)}</strong><span className="grade-tag grade-tag--ax">A / X</span></div></td>
        <td><div className="quantity-cell"><strong>{nf.format(rec.quantity)} шт.</strong><span>из {nf.format(rec.sourceQuantity)} шт.</span></div></td>
        {!compact && <td className="value-cell">{money(rec.value)}</td>}
        <td className="align-right"><button className="row-action" onClick={() => setModal({ kind: "transfer", recommendation: rec })}>Оформить <ArrowRight size={15} /></button></td>
      </tr>)}</tbody>
    </table></div>;
  }

  function overviewView() {
    if (!data.inventory.length) return <EmptyWorkspace onImport={() => navigate("import")} />;
    const recent = data.transfers.slice(0, 4);
    return <>
      <PageHeading kicker="ПАНЕЛЬ УПРАВЛЕНИЯ" title="Обзор сети аптек" description="Запасы под контролем. Товары — там, где они нужнее.">
        <a className="btn btn-secondary" href="/api/export"><Download size={17} />Экспорт Excel</a>
        <button className="btn btn-primary" onClick={() => navigate("import")}><FileUp size={18} />Загрузить Excel</button>
      </PageHeading>
      <div className="stats-grid">
        <StatCard label="Аптек в сети" value={nf.format(data.pharmacies.length)} caption="активных точек" icon={Building2} tone="blue" />
        <StatCard label="Товаров в каталоге" value={nf.format(data.products.length)} caption={`${nf.format(totalStock)} шт. в наличии`} icon={Pill} tone="purple" />
        <StatCard label="Рекомендаций" value={nf.format(data.recommendations.length)} caption="к перемещению" icon={Sparkles} tone="amber" detail={data.recommendations.length ? "CZ → AX" : undefined} />
        <StatCard label="Потенциал перемещения" value={money(recommendedValue)} caption="стоимость товаров" icon={TrendingUp} tone="mint" />
      </div>
      <section className="surface overview-matrix-teaser"><div className="overview-matrix-info"><span className="overview-matrix-icon"><Grid3X3 size={21} /></span><div><h2>Матрица ABC/XYZ по аптекам</h2><p>{data.pharmacies.length} аптек · {nf.format(data.inventory.length)} позиций · {nf.format(totalStock)} упаковок. Только данные загруженных файлов.</p></div></div><div className="overview-matrix-mini">{["AX", "AY", "AZ", "BX", "BY", "BZ", "CX", "CY", "CZ"].map((grade) => <span key={grade} className={`overview-mini-cell overview-mini-cell--${grade.toLowerCase()}`}><small>{grade[0]}/{grade[1]}</small><strong>{data.inventory.filter((item) => item.abc === grade[0] && item.xyz === grade[1]).length}</strong></span>)}</div><button className="btn btn-secondary" onClick={() => navigate("matrix")}>Открыть матрицу <ArrowRight size={16} /></button></section>
      <div className="dashboard-grid">
        <section className="surface recommendations-surface">
          <div className="section-header"><div><div className="section-title-row"><h2>Приоритетные перемещения</h2><span className="count-badge">{data.recommendations.length}</span></div><p>Товары из аптек C/Z в аптеки A/X</p></div><button className="text-link" onClick={() => navigate("recommendations")}>Все рекомендации <ArrowRight size={16} /></button></div>
          {recommendationTable(data.recommendations.slice(0, 5), true)}
          {data.recommendations.length > 5 && <div className="surface-footer"><button className="footer-link" onClick={() => navigate("recommendations")}>Показать все {data.recommendations.length} рекомендаций <ArrowRight size={15} /></button></div>}
        </section>
        <section className="surface analytics-surface">
          <div className="section-header"><div><h2>Структура запасов</h2><p>По ABC-классификации</p></div><div className="section-icon"><Activity size={18} /></div></div>
          <div className="donut-wrap"><div className="donut-chart" style={{ background: `conic-gradient(#17aa91 0% ${aPercent}%, #efbc69 ${aPercent}% ${aPercent + bPercent}%, #d9e4e7 ${aPercent + bPercent}% 100%)` }}><div className="donut-hole"><strong>{nf.format(data.inventory.length)}</strong><span>позиций</span></div></div></div>
          <div className="chart-legend"><div><span className="legend-dot legend-a" /><span>Группа A</span><strong>{gradeCounts.A}</strong></div><div><span className="legend-dot legend-b" /><span>Группа B</span><strong>{gradeCounts.B}</strong></div><div><span className="legend-dot legend-c" /><span>Группа C</span><strong>{gradeCounts.C}</strong></div></div>
          <div className="insight-note"><div className="insight-note-icon"><Sparkles size={17} /></div><div><strong>Умное перераспределение</strong><span>Находим излишки C/Z и направляем их туда, где спрос стабилен — в A/X.</span></div></div>
        </section>
      </div>
      <div className="bottom-grid">
        <section className="surface activity-surface"><div className="section-header"><div><h2>Последние перемещения</h2><p>Что происходит в вашей сети</p></div><button className="text-link" onClick={() => navigate("transfers")}>Вся история <ArrowRight size={16} /></button></div>
          {recent.length ? <div className="activity-list">{recent.map((item) => <div className="activity-item" key={item.id}>
            <div className={`activity-icon activity-icon--${item.status}`}>{item.status === "completed" ? <Check size={18} /> : item.status === "cancelled" ? <X size={17} /> : <Clock3 size={18} />}</div>
            <div className="activity-body"><strong>{catalog.get(item.productId)?.name ?? "Товар"}</strong><span>{storeShort(stores.get(item.fromPharmacyId)?.name)} <ArrowRight size={12} /> {storeShort(stores.get(item.toPharmacyId)?.name)} · {item.quantity} шт.</span></div>
            <div className="activity-meta"><span className={`status-pill status-pill--${item.status}`}>{statusLabel(item.status)}</span><small>{shortDate(item.createdAt)}</small></div>
          </div>)}</div> : <EmptyState title="История пока пуста" description="Здесь появятся ваши перемещения." />}
        </section>
        <section className="surface workflow-surface"><div className="section-header"><div><h2>Как это работает</h2><p>Три шага к точному балансу</p></div><div className="section-icon"><CircleHelp size={19} /></div></div>
          <div className="workflow-steps"><div className="workflow-step"><span className="step-number">01</span><div><strong>Загрузите остатки</strong><p>Импортируйте Excel с данными аптек и классами ABC/XYZ.</p></div></div><div className="workflow-step"><span className="step-number">02</span><div><strong>Проверьте рекомендации</strong><p>Система найдёт одинаковые товары в точках C/Z и A/X.</p></div></div><div className="workflow-step"><span className="step-number">03</span><div><strong>Переместите и выгрузите</strong><p>Подтвердите передачу и скачайте обновлённый Excel.</p></div></div></div>
          <button className="workflow-link" onClick={() => navigate("import")}>Начать с Excel <ArrowRight size={16} /></button>
        </section>
      </div>
    </>;
  }

  function recommendationsView() {
    const query = search.toLowerCase().trim();
    const filtered = data.recommendations.filter((rec) => !query || [catalog.get(rec.productId)?.name, catalog.get(rec.productId)?.sku, stores.get(rec.fromPharmacyId)?.name, stores.get(rec.toPharmacyId)?.name].some((value) => value?.toLowerCase().includes(query)));
    const units = filtered.reduce((sum, item) => sum + item.quantity, 0);
    return <>
      <PageHeading kicker="УМНОЕ ПЕРЕРАСПРЕДЕЛЕНИЕ" title="Рекомендации" description="Находите излишки и направляйте товары туда, где они продаются быстрее.">
        <button className="btn btn-secondary" onClick={() => navigate("import")}><FileUp size={17} />Обновить данные</button>
        <a className="btn btn-primary" href="/api/export"><Download size={17} />Выгрузить план</a>
      </PageHeading>
      <div className="recommendation-banner"><div className="banner-sparkle"><Sparkles size={25} /></div><div><strong>Алгоритм ABC × XYZ работает на вас</strong><p>Совпадения одного товара: <b>C/Z</b> — низкий спрос и нерегулярные продажи, <b>A/X</b> — высокий и стабильный спрос. Объём учитывает доступный и минимальный запас.</p></div><div className="banner-symbol">CZ <ArrowRight size={18} /> AX</div></div>
      <div className="mini-stats"><div><span>Найдено маршрутов</span><strong>{filtered.length}</strong></div><div><span>Товаров к передаче</span><strong>{nf.format(units)} шт.</strong></div><div><span>Стоимость перемещений</span><strong>{money(filtered.reduce((sum, rec) => sum + rec.value, 0))}</strong></div></div>
      <section className="surface list-surface"><div className="section-header list-section-header"><div><div className="section-title-row"><h2>Рекомендованные перемещения</h2><span className="count-badge">{filtered.length}</span></div><p>Нажмите «Оформить», чтобы создать план перемещения</p></div><SearchInput value={search} onChange={setSearch} placeholder="Товар или аптека..." /></div>
        {filtered.length ? recommendationTable(filtered) : query ? <EmptyState title="Ничего не найдено" description="Попробуйте изменить поисковый запрос." /> : recommendationTable([])}
      </section>
    </>;
  }

  function inventoryView() {
    const query = search.toLowerCase().trim();
    const filtered = data.inventory.filter((item) => {
      const product = catalog.get(item.productId); const store = stores.get(item.pharmacyId);
      return (!query || [product?.name, product?.sku, store?.name].some((value) => value?.toLowerCase().includes(query)))
        && (pharmacyFilter === "all" || item.pharmacyId === Number(pharmacyFilter))
        && (abcFilter === "all" || item.abc === abcFilter) && (xyzFilter === "all" || item.xyz === xyzFilter);
    });
    const pages = Math.max(1, Math.ceil(filtered.length / 10));
    const currentPage = Math.min(page, pages);
    const visible = filtered.slice((currentPage - 1) * 10, currentPage * 10);
    return <>
      <PageHeading kicker="СКЛАДСКОЙ УЧЁТ" title="Остатки товаров" description="Данные загруженных Excel-файлов в разрезе аптек. Чтобы обновить остатки, загрузите новый файл.">
        <a className="btn btn-secondary" href="/api/export"><Download size={17} />Экспорт Excel</a>
        <button className="btn btn-primary" onClick={() => navigate("import")}><FileUp size={18} />Обновить из Excel</button>
      </PageHeading>
      <div className="inventory-summary"><div><div className="summary-icon"><Package size={20} /></div><div><strong>{nf.format(data.inventory.length)}</strong><span>позиций в сети</span></div></div><div><div className="summary-icon summary-icon--soft"><PackageCheck size={20} /></div><div><strong>{nf.format(totalStock)}</strong><span>упаковок в наличии</span></div></div><div><div className="summary-icon summary-icon--warm"><Sparkles size={20} /></div><div><strong>{data.inventory.filter((item) => item.abc === "C" && item.xyz === "Z").length}</strong><span>позиций группы C/Z</span></div></div></div>
      <section className="surface list-surface"><div className="section-header list-section-header"><div><h2>Товары по аптекам</h2><p>{filtered.length} {filtered.length === 1 ? "позиция" : "позиций"} по заданным фильтрам</p></div></div>
        <div className="filter-bar"><SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Название или артикул..." /><div className="filter-selects"><select aria-label="Фильтр по аптеке" value={pharmacyFilter} onChange={(event) => { setPharmacyFilter(event.target.value); setPage(1); }}><option value="all">Все аптеки</option>{data.pharmacies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Фильтр ABC" value={abcFilter} onChange={(event) => { setAbcFilter(event.target.value); setPage(1); }}><option value="all">Все ABC</option>{["A", "B", "C"].map((grade) => <option key={grade}>{grade}</option>)}</select><select aria-label="Фильтр XYZ" value={xyzFilter} onChange={(event) => { setXyzFilter(event.target.value); setPage(1); }}><option value="all">Все XYZ</option>{["X", "Y", "Z"].map((grade) => <option key={grade}>{grade}</option>)}</select></div></div>
        {visible.length ? <div className="table-scroll"><table className="data-table stock-table"><thead><tr><th>ТОВАР</th><th>АПТЕКА</th><th>ABC / XYZ</th><th>ОСТАТОК</th><th>МИН. ЗАПАС</th><th>ЦЕНА</th></tr></thead><tbody>{visible.map((item) => <tr key={item.id}>
          <td><ProductCell product={catalog.get(item.productId)} /></td><td><div className="store-table-cell"><strong>{storeShort(stores.get(item.pharmacyId)?.name)}</strong><span>{stores.get(item.pharmacyId)?.code}</span></div></td>
          <td><span className={`grade-tag ${item.abc === "C" && item.xyz === "Z" ? "grade-tag--cz" : item.abc === "A" && item.xyz === "X" ? "grade-tag--ax" : "grade-tag--neutral"}`}>{item.abc} / {item.xyz}</span></td>
          <td><strong className={item.quantity < item.minStock ? "low-stock" : "stock-number"}>{nf.format(item.quantity)} шт.</strong></td><td className="muted-cell">{nf.format(item.minStock)} шт.</td><td className="value-cell">{money(catalog.get(item.productId)?.price ?? 0)}</td>
          
        </tr>)}</tbody></table></div> : <EmptyState title="Позиции не найдены" description="Загрузите Excel с остатками или измените фильтры поиска." action="Загрузить Excel" onAction={() => navigate("import")} />}
        <Pagination page={currentPage} pages={pages} onChange={setPage} total={filtered.length} />
      </section>
    </>;
  }

  function transfersView() {
    const query = search.toLowerCase().trim();
    const filtered = data.transfers.filter((item) => (transferFilter === "all" || item.status === transferFilter) && (!query || [catalog.get(item.productId)?.name, stores.get(item.fromPharmacyId)?.name, stores.get(item.toPharmacyId)?.name].some((value) => value?.toLowerCase().includes(query))));
    const planned = data.transfers.filter((item) => item.status === "planned").length;
    const completed = data.transfers.filter((item) => item.status === "completed").length;
    const tabs = [{ key: "all", label: "Все", count: data.transfers.length }, { key: "planned", label: "Запланированы", count: planned }, { key: "completed", label: "Выполнены", count: completed }, { key: "cancelled", label: "Отменены", count: data.transfers.filter((item) => item.status === "cancelled").length }];
    return <>
      <PageHeading kicker="ЛОГИСТИКА СЕТИ" title="Перемещения" description="Планируйте, подтверждайте и отслеживайте передачу товаров между аптеками.">{data.inventory.length && data.pharmacies.length > 1 ? <button className="btn btn-primary" onClick={() => setModal({ kind: "transfer" })}><Plus size={18} />Новое перемещение</button> : <button className="btn btn-primary" onClick={() => navigate("import")}><FileUp size={18} />Загрузить данные</button>}</PageHeading>
      <div className="transfer-summary"><div><span className="summary-dot dot-amber" /><span>Ожидают выполнения</span><strong>{planned}</strong></div><div><span className="summary-dot dot-green" /><span>Выполнены</span><strong>{completed}</strong></div><div><span className="summary-dot dot-blue" /><span>Всего перемещений</span><strong>{data.transfers.length}</strong></div></div>
      <section className="surface list-surface"><div className="section-header list-section-header"><div><h2>История перемещений</h2><p>Каждая передача товара в одном месте</p></div><SearchInput value={search} onChange={setSearch} placeholder="Товар или аптека..." /></div>
        <div className="tab-bar">{tabs.map((tab) => <button key={tab.key} className={transferFilter === tab.key ? "tab active" : "tab"} onClick={() => setTransferFilter(tab.key)}>{tab.label}<span>{tab.count}</span></button>)}</div>
        {filtered.length ? <div className="table-scroll"><table className="data-table transfers-table"><thead><tr><th>ТОВАР</th><th>МАРШРУТ</th><th>КОЛ-ВО</th><th>ДАТА</th><th>СТАТУС</th><th className="align-right">ДЕЙСТВИЯ</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}>
          <td><ProductCell product={catalog.get(item.productId)} subtitle={`№ ${String(item.id).padStart(4, "0")}`} /></td>
          <td><div className="route-table-cell"><span>{storeShort(stores.get(item.fromPharmacyId)?.name)}</span><ArrowRight size={14} /><strong>{storeShort(stores.get(item.toPharmacyId)?.name)}</strong></div></td>
          <td className="stock-number">{item.quantity} шт.</td><td className="muted-cell">{shortDate(item.createdAt)}</td><td><span className={`status-pill status-pill--${item.status}`}>{statusLabel(item.status)}</span></td>
          <td className="align-right"><div className="row-buttons">{item.status === "planned" && <><button className="complete-btn" onClick={() => completeMovement(item)}><Check size={15} />Завершить</button><button className="table-icon-btn" title="Редактировать" aria-label="Редактировать перемещение" onClick={() => setModal({ kind: "transfer", item })}><Pencil size={16} /></button><button className="table-icon-btn" title="Отменить" aria-label="Отменить перемещение" onClick={() => cancelMovement(item)}><X size={16} /></button></>}{item.status !== "completed" && <button className="table-icon-btn table-icon-btn--danger" title="Удалить" aria-label="Удалить перемещение" onClick={() => askDelete(item)}><Trash2 size={16} /></button>}{item.status === "completed" && <span className="completed-check"><CheckCircle2 size={17} />Готово</span>}</div></td>
        </tr>)}</tbody></table></div> : <EmptyState icon={ArrowLeftRight} title="Перемещений пока нет" description={data.inventory.length ? "Оформите перемещение по рекомендации или создайте план между аптеками." : "Сначала загрузите остатки аптек из Excel-файла."} action={data.inventory.length && data.pharmacies.length > 1 ? "Новое перемещение" : "Загрузить Excel"} onAction={() => data.inventory.length && data.pharmacies.length > 1 ? setModal({ kind: "transfer" }) : navigate("import")} />}
      </section>
    </>;
  }

  function pharmaciesView() {
    const query = search.toLowerCase().trim();
    const filtered = data.pharmacies.filter((item) => !query || [item.name, item.code, item.city, item.address].some((value) => value.toLowerCase().includes(query)));
    return <>
      <PageHeading kicker="ВАША СЕТЬ" title="Аптеки" description="Список аптек и объёмы запасов сохраняются из загруженных Excel-файлов."><button className="btn btn-primary" onClick={() => navigate("import")}><FileUp size={18} />Загрузить аптеки</button></PageHeading>
      <div className="collection-toolbar"><div><strong>{data.pharmacies.length} аптек</strong><span>в вашей сети</span></div><SearchInput value={search} onChange={setSearch} placeholder="Найти аптеку..." /></div>
      {filtered.length ? <div className="pharmacy-grid">{filtered.map((item) => {
        const items = data.inventory.filter((stock) => stock.pharmacyId === item.id);
        const inStock = items.reduce((sum, stock) => sum + stock.quantity, 0);
        return <article className="pharmacy-card" key={item.id}>
          <div className="pharmacy-card-top"><div className="pharmacy-icon"><Building2 size={23} strokeWidth={1.8} /></div><span className="pharmacy-code">{item.code}</span></div>
          <h3>{item.name}</h3><p className="pharmacy-address"><MapPin size={15} />{[item.city, item.address].filter(Boolean).join(", ") || "Адрес не указан"}</p>
          <div className="pharmacy-card-stats"><div><strong>{items.length}</strong><span>позиций</span></div><div><strong>{nf.format(inStock)}</strong><span>упаковок</span></div></div>
          <div className="pharmacy-card-footer"><button onClick={() => { navigate("inventory"); setPharmacyFilter(String(item.id)); }}>Смотреть остатки <ArrowRight size={15} /></button><button onClick={() => navigate("matrix")}>Матрица <Grid3X3 size={15} /></button></div>
        </article>;
      })}</div> : <div className="surface"><EmptyState icon={Building2} title="Аптеки не найдены" description="Загрузите Excel с данными аптек или измените поисковый запрос." action="Загрузить Excel" onAction={() => navigate("import")} /></div>}
    </>;
  }

  function productsView() {
    const query = search.toLowerCase().trim();
    const filtered = data.products.filter((item) => !query || [item.name, item.sku, item.category, item.manufacturer].some((value) => value.toLowerCase().includes(query)));
    return <>
      <PageHeading kicker="АССОРТИМЕНТ" title="Каталог товаров" description="Препараты, артикулы и цены из ваших Excel-файлов."><button className="btn btn-primary" onClick={() => navigate("import")}><FileUp size={18} />Обновить каталог</button></PageHeading>
      <section className="surface list-surface"><div className="section-header list-section-header"><div><div className="section-title-row"><h2>Все товары</h2><span className="count-badge">{data.products.length}</span></div><p>Карточки товаров и присутствие в аптеках</p></div><SearchInput value={search} onChange={setSearch} placeholder="Название, артикул..." /></div>
        {filtered.length ? <div className="table-scroll"><table className="data-table products-table"><thead><tr><th>ТОВАР</th><th>КАТЕГОРИЯ</th><th>ПРОИЗВОДИТЕЛЬ</th><th>В АПТЕКАХ</th><th>ЦЕНА</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}>
          <td><ProductCell product={item} /></td><td><span className="category-pill">{item.category}</span></td><td className="muted-cell">{item.manufacturer || "—"}</td><td><span className="locations-count"><Building2 size={15} />{data.inventory.filter((stock) => stock.productId === item.id).length}</span></td><td className="value-cell">{money(item.price)}</td>
        </tr>)}</tbody></table></div> : <EmptyState icon={Pill} title="Товары не найдены" description="Каталог заполнится товарами из загруженного Excel-файла." action="Загрузить Excel" onAction={() => navigate("import")} />}
      </section>
    </>;
  }

  function importView() {
    return <>
      <PageHeading kicker="РАБОТА С ФАЙЛАМИ" title="Импорт Excel" description="Загрузите остатки аптек — мы найдём возможности для перемещения товаров."><a className="btn btn-secondary" href="/api/export?template=1"><Download size={17} />Скачать шаблон</a></PageHeading>
      {importResult !== null && <div className="import-success"><CheckCircle2 size={22} /><div><strong>Сохранено {nf.format(importResult.rows)} позиций в {nf.format(importResult.pharmacies)} аптеках</strong><span>{nf.format(importResult.units)} упаковок · матрица ABC/XYZ и история загрузки сохранены.</span></div><button onClick={() => navigate("matrix")}>Открыть матрицу <ArrowRight size={16} /></button></div>}
      <div className="import-grid"><div className="surface import-main"><div className="section-header"><div><h2>Загрузить файл с остатками</h2><p>Поддерживается формат .xlsx до 10 МБ</p></div><div className="section-icon"><FileSpreadsheet size={20} /></div></div>
        <div className={`dropzone ${dragging ? "dropzone--active" : ""} ${uploading ? "dropzone--busy" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={(event) => { event.preventDefault(); setDragging(false); }} onDrop={handleDrop}>
          <div className="upload-illustration"><UploadCloud size={37} strokeWidth={1.65} /><span className="upload-deco upload-deco-one" /><span className="upload-deco upload-deco-two" /></div>
          <h3>{uploading ? "Загружаем и обрабатываем файл..." : "Перетащите Excel-файл сюда"}</h3><p>или выберите его на вашем устройстве</p>
          <button className="btn btn-primary" disabled={uploading} onClick={() => fileInput.current?.click()}>{uploading ? <Loader2 size={18} className="spin" /> : <FileUp size={18} />}{uploading ? "Импортируем..." : "Выбрать файл"}</button>
          <span className="dropzone-hint">XLSX · максимум 10 МБ · до 3000 строк</span>
          <input ref={fileInput} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file); }} />
        </div>
        <label className="import-pharmacy-field"><span>Название аптеки <small>если в файле нет колонки «Аптека»</small></span><input value={importPharmacyName} onChange={(event) => setImportPharmacyName(event.target.value)} placeholder="Например, Аптека на Арбате" maxLength={160} disabled={uploading} /></label>
        <div className="import-tip"><ShieldCheck size={19} /><span><strong>Каждая загрузка сохраняется.</strong> Остатки аптек из файла обновляются целиком; остальные аптеки не затрагиваются. Историческая матрица и объём импорта останутся в архиве.</span></div>
      </div>
      <div className="surface format-card"><div className="section-header"><div><h2>Как подготовить файл</h2><p>Простая структура для точного анализа</p></div></div>
        <div className="format-steps"><div><span>1</span><p><strong>Одна строка — один товар</strong> в одной аптеке. Можно загрузить несколько листов.</p></div><div><span>2</span><p>Нужны колонки <strong>Товар, ABC, XYZ, Остаток</strong> и название аптеки в строке, листе или поле слева.</p></div><div><span>3</span><p>Для одного товара в разных аптеках используйте <strong>одинаковый артикул</strong>.</p></div></div>
        <div className="format-example"><div className="format-example-title"><FileSpreadsheet size={17} />Правило перемещения</div><div><span>Аптека-отправитель</span><span className="grade-tag grade-tag--cz">C / Z</span></div><div className="format-arrow"><ArrowRight size={17} /></div><div><span>Аптека-получатель</span><span className="grade-tag grade-tag--ax">A / X</span></div></div>
        <a className="format-download" href="/api/export?template=1"><Download size={17} />Скачать пустой шаблон <ArrowRight size={16} /></a>
      </div></div>
      <section className="surface import-history"><div className="section-header"><div><h2>История загрузок</h2><p>Последние импортированные файлы</p></div><span className="count-badge">{data.imports.length}</span></div>
        {data.imports.length ? <div className="table-scroll"><table className="data-table import-history-table"><thead><tr><th>ФАЙЛ</th><th>ДАТА ЗАГРУЗКИ</th><th>АПТЕК</th><th>ПОЗИЦИЙ</th><th>УПАКОВОК</th><th>РАЗМЕР</th></tr></thead><tbody>{data.imports.map((batch) => <tr key={batch.id}><td><div className="file-cell"><span className="file-icon"><FileSpreadsheet size={19} /></span><strong>{batch.filename}</strong></div></td><td className="muted-cell">{fullDate(batch.createdAt)}</td><td className="stock-number">{nf.format(batch.pharmaciesCount)}</td><td className="stock-number">{nf.format(batch.rowsImported)}</td><td className="stock-number">{nf.format(batch.totalUnits)} шт.</td><td className="muted-cell">{fileSize(batch.fileSize)}</td></tr>)}</tbody></table></div> : <EmptyState icon={FileSpreadsheet} title="Загрузок пока нет" description="Загрузите первый XLSX-файл, чтобы сохранить статистику аптек и матрицу." />}
      </section>
    </>;
  }

  function renderView() {
    switch (view) {
      case "overview": return overviewView();
      case "matrix": return <MatrixView data={data} onImport={() => navigate("import")} onInventory={(store, abc, xyz) => { navigate("inventory"); setPharmacyFilter(String(store)); setAbcFilter(abc); setXyzFilter(xyz); }} />;
      case "recommendations": return recommendationsView();
      case "inventory": return inventoryView();
      case "transfers": return transfersView();
      case "pharmacies": return pharmaciesView();
      case "products": return productsView();
      case "import": return importView();
    }
  }

  function navButton(item: NavItem) {
    const Icon = item.icon;
    return <button key={item.id} className={`nav-item ${view === item.id ? "nav-item--active" : ""}`} onClick={() => navigate(item.id)}><Icon size={19} strokeWidth={view === item.id ? 2.1 : 1.8} /><span>{item.label}</span>{item.id === "recommendations" && data.recommendations.length > 0 && <span className="nav-count">{data.recommendations.length}</span>}</button>;
  }

  return <div className="app-shell">
    {mobileMenu && <button className="mobile-backdrop" aria-label="Закрыть меню" onClick={() => setMobileMenu(false)} />}
    <aside className={`sidebar ${mobileMenu ? "sidebar--open" : ""}`}>
      <button className="brand" onClick={() => navigate("overview")} aria-label="ФармаБаланс — обзор">
        <span className="brand-mark"><Pill size={23} strokeWidth={2.3} /><span className="brand-spark">✦</span></span>
        <span className="brand-text"><strong>фарма<span>баланс</span></strong><small>Управление запасами</small></span>
      </button>
      <div className="sidebar-content"><div className="nav-group"><div className="nav-heading">РАБОЧЕЕ ПРОСТРАНСТВО</div><nav>{mainNav.map(navButton)}</nav></div><div className="nav-group nav-group--second"><div className="nav-heading">УПРАВЛЕНИЕ</div><nav>{managementNav.map(navButton)}</nav></div></div>
      <div className="sidebar-bottom"><div className="sidebar-help"><div className="sidebar-help-icon"><Sparkles size={18} /></div><strong>Умнее с каждым шагом</strong><p>Загрузите Excel и найдите новые возможности для вашей сети.</p><button onClick={() => navigate("import")}>Загрузить файл <ArrowRight size={15} /></button></div><div className="sidebar-user"><div className="user-avatar">ГФ</div><div><strong>Главный фармацевт</strong><span><span className="online-dot" />Доступ без входа</span></div></div></div>
    </aside>
    <div className="main-area"><header className="topbar"><div className="topbar-left"><button className="mobile-menu-button" aria-label="Открыть меню" onClick={() => setMobileMenu(true)}><Menu size={22} /></button><span className="breadcrumb-root">Рабочее пространство</span><ChevronRight size={16} /><span className="breadcrumb-current">{pageLabels[view]}</span></div><div className="topbar-right"><span className="topbar-date">{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date())}</span><span className="topbar-divider" /><button className="topbar-icon-button" onClick={() => void refreshData()} title="Обновить данные" aria-label="Обновить данные">{refreshing ? <Loader2 size={19} className="spin" /> : <RotateCw size={19} />}</button><button className="topbar-icon-button notification-button" onClick={() => navigate("recommendations")} title="Рекомендации" aria-label="Перейти к рекомендациям"><Bell size={20} />{data.recommendations.length > 0 && <i />}</button><span className="topbar-divider" /><div className="topbar-profile"><div className="topbar-avatar">ГФ</div><div><strong>Главный фармацевт</strong><span>Администратор сети</span></div></div></div></header><main className="content-wrap">{renderView()}<footer className="main-footer"><span>© {new Date().getFullYear()} ФармаБаланс</span><span><span className="footer-online-dot" />Все данные синхронизированы</span></footer></main></div>
    {modal?.kind === "confirm" && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setModal(null); }}><section className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"><button className="confirm-close icon-button" onClick={() => setModal(null)} disabled={busy} aria-label="Закрыть"><X size={19} /></button><div className={`confirm-icon ${modal.danger ? "confirm-icon--danger" : ""}`}>{modal.danger ? <AlertTriangle size={24} /> : <ArrowLeftRight size={24} />}</div><h2 id="confirm-title">{modal.title}</h2><p>{modal.description}</p><div className="confirm-actions"><button className="btn btn-secondary" onClick={() => setModal(null)} disabled={busy}>Назад</button><button className={`btn ${modal.danger ? "btn-danger" : "btn-primary"}`} onClick={() => void modal.onConfirm()} disabled={busy}>{busy && <Loader2 size={16} className="spin" />}{modal.confirmLabel}</button></div></section></div>}
    {modal && modal.kind !== "confirm" && <EditorModal key={`${modal.kind}-${modal.item?.id ?? (modal.kind === "transfer" ? modal.recommendation?.key : undefined) ?? "new"}`} modal={modal} data={data} busy={busy} onClose={() => setModal(null)} onSave={saveEditor} />}
    {toast && <div className={`toast toast--${toast.kind}`} role="status">{toast.kind === "success" ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}<span>{toast.message}</span><button onClick={() => setToast(null)} aria-label="Закрыть уведомление"><X size={16} /></button></div>}
  </div>;
}
