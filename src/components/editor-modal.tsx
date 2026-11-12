"use client";

import { useState, type FormEvent } from "react";
import { ArrowLeftRight, Loader2, Pill, X } from "lucide-react";
import type { AppData, InventoryItem, Recommendation, Transfer } from "@/lib/types";

export type EditorModalState = { kind: "transfer"; item?: Transfer; recommendation?: Recommendation };

function freeStock(item: InventoryItem, data: AppData, exceptId?: number) {
  const reserved = data.transfers
    .filter((movement) => movement.status === "planned" && movement.productId === item.productId && movement.fromPharmacyId === item.pharmacyId && movement.id !== exceptId)
    .reduce((sum, movement) => sum + movement.quantity, 0);
  return Math.max(0, item.quantity - reserved);
}

function initialValues(modal: EditorModalState, data: AppData): Record<string, string> {
  const firstStock = data.inventory.find((item) => freeStock(item, data, modal.item?.id) > 0);
  const fromId = modal.item?.fromPharmacyId ?? modal.recommendation?.fromPharmacyId ?? firstStock?.pharmacyId;
  const toId = modal.item?.toPharmacyId ?? modal.recommendation?.toPharmacyId
    ?? data.pharmacies.find((item) => item.id !== fromId)?.id;
  return {
    productId: String(modal.item?.productId ?? modal.recommendation?.productId ?? firstStock?.productId ?? ""),
    fromPharmacyId: String(fromId ?? ""), toPharmacyId: String(toId ?? ""),
    quantity: String(modal.item?.quantity ?? modal.recommendation?.quantity ?? 1),
    note: modal.item?.note ?? (modal.recommendation ? "По рекомендации ABC/XYZ: из C/Z в A/X" : ""),
  };
}

export function EditorModal({ modal, data, busy, onClose, onSave }: {
  modal: EditorModalState;
  data: AppData;
  busy: boolean;
  onClose: () => void;
  onSave: (values: Record<string, string>) => Promise<boolean>;
}) {
  const [form, setForm] = useState<Record<string, string>>(() => initialValues(modal, data));
  const editing = Boolean(modal.item);
  const available = (item: InventoryItem) => freeStock(item, data, modal.item?.id);
  const storeOptions = data.pharmacies.map((item) => ({ value: String(item.id), label: `${item.name} · ${item.code}` }));
  const productOptions = data.products.map((item) => ({ value: String(item.id), label: item.name }));
  const sourceOptions = data.inventory
    .filter((item) => item.productId === Number(form.productId) && available(item) > 0)
    .map((item) => ({ value: String(item.pharmacyId), label: `${data.pharmacies.find((store) => store.id === item.pharmacyId)?.name ?? "Аптека"} · ${available(item)} шт. свободно` }));
  const targetOptions = storeOptions.filter((item) => item.value !== form.fromPharmacyId);
  const selectedSource = data.inventory.find((item) => item.productId === Number(form.productId) && item.pharmacyId === Number(form.fromPharmacyId));

  function change(key: string, value: string) {
    if (key === "productId") {
      const stock = data.inventory.find((item) => item.productId === Number(value) && available(item) > 0);
      const target = data.pharmacies.find((item) => item.id !== stock?.pharmacyId);
      setForm((current) => ({ ...current, productId: value, fromPharmacyId: String(stock?.pharmacyId ?? ""), toPharmacyId: String(target?.id ?? "") }));
    } else if (key === "fromPharmacyId" && value === form.toPharmacyId) {
      const target = data.pharmacies.find((item) => String(item.id) !== value);
      setForm((current) => ({ ...current, fromPharmacyId: value, toPharmacyId: String(target?.id ?? "") }));
    } else {
      setForm((current) => ({ ...current, [key]: value }));
    }
  }

  function select(key: string, label: string, options: Array<{ value: string; label: string }>) {
    return <label className="form-field" key={key}><span>{label}</span><select value={form[key] ?? ""} onChange={(event) => change(key, event.target.value)} required>
      {options.length === 0 && <option value="">Нет доступных вариантов</option>}
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select></label>;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSave(form);
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="editor-modal" role="dialog" aria-modal="true" aria-labelledby="editor-title">
      <div className="modal-header"><div className="modal-heading-group"><div className="modal-icon"><ArrowLeftRight size={22} strokeWidth={1.9} /></div><div><h2 id="editor-title">{editing ? "Изменить перемещение" : "Оформить перемещение"}</h2><p>План передачи товара между аптеками</p></div></div><button className="icon-button" type="button" onClick={onClose} disabled={busy} aria-label="Закрыть"><X size={19} /></button></div>
      <form onSubmit={submit}><div className="modal-body"><div className="form-grid">
        {modal.item ? <div className="form-span-2 transfer-context"><Pill size={19} /><span>{data.products.find((item) => item.id === modal.item?.productId)?.name ?? "Товар"}</span></div> : <div className="form-span-2">{select("productId", "Товар", productOptions)}</div>}
        {modal.item ? <div className="form-span-2 transfer-route-text">{data.pharmacies.find((item) => item.id === modal.item?.fromPharmacyId)?.name} → {data.pharmacies.find((item) => item.id === modal.item?.toPharmacyId)?.name}</div> : <><div className="form-span-2">{select("fromPharmacyId", "Из аптеки", sourceOptions)}</div><div className="form-span-2">{select("toPharmacyId", "В аптеку", targetOptions)}</div></>}
        <label className="form-field form-span-2"><span>Количество, шт.</span><input type="number" min="1" step="1" required value={form.quantity ?? ""} onChange={(event) => change("quantity", event.target.value)} /></label>
        <div className="form-span-2 form-field"><label htmlFor="transfer-note">Комментарий <span className="optional-label">необязательно</span></label><textarea id="transfer-note" value={form.note ?? ""} rows={3} placeholder="Причина перемещения" onChange={(event) => change("note", event.target.value)} /></div>
        {!modal.item && <div className="form-span-2 form-hint">Свободно у отправителя: <strong>{selectedSource ? available(selectedSource) : 0} шт.</strong> После создания перемещение будет в статусе «Запланировано».</div>}
      </div></div><div className="modal-footer"><button className="btn btn-secondary" type="button" onClick={onClose} disabled={busy}>Отмена</button><button className="btn btn-primary" type="submit" disabled={busy || (!modal.item && (!selectedSource || available(selectedSource) <= 0))}>{busy && <Loader2 size={17} className="spin" />}{editing ? "Сохранить изменения" : "Создать перемещение"}</button></div></form>
    </section>
  </div>;
}
