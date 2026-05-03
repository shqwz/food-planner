import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, apiPatch, apiDelete } from "../api/client";

const UNIT_OPTIONS = ["г", "мл", "шт", "кг"];

function fmtDay(iso) {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function fmtRangeHeading(dates) {
  const ds = [...(dates || [])].sort();
  if (!ds.length) return "Корзина";
  if (ds.length === 1) return `На ${fmtDay(ds[0])}`;
  return `${fmtDay(ds[0])} — ${fmtDay(ds[ds.length - 1])}`;
}

function ruMoney(n) {
  const v = Math.round(Number(n) || 0);
  return `~${v.toLocaleString("ru-RU")} ₽`;
}

export default function ShoppingTab({ showToast, userId }) {
  const [mode, setMode] = useState("view"); // view | trip | edit
  const [cartDays, setCartDays] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cart, setCart] = useState(null);
  const [lineModal, setLineModal] = useState(null);
  const [replanModal, setReplanModal] = useState(null);

  const loadCart = useCallback(async () => {
    if (userId == null || userId === "") return;
    setError("");
    const data = await apiGet("/api/shopping", { user_id: userId });
    setCart(data);
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load on mount / userId
    loadCart().catch((e) => setError(e.message));
  }, [loadCart]);

  const grouped = cart?.grouped_by_date || {};
  const dates = cart?.dates || [];
  const summary = cart?.summary || {};
  const budget = summary.budget_weekly;
  const tripTotal =
    cart?.items?.reduce((s, i) => s + (i.skipped_in_trip ? 0 : Number(i.estimated_cost) || 0), 0) ?? 0;
  const viewTotal = summary.estimated_total ?? 0;
  const remainder = summary.remainder;
  const overBudget = typeof remainder === "number" && remainder < 0;

  const headline = useMemo(() => {
    if (mode === "trip") return "Отмечаем покупки";
    if (mode === "edit") return "Редактирование списка";
    return `Корзина · ${fmtRangeHeading(dates)}`;
  }, [mode, dates]);

  const run = async (fn) => {
    setLoading(true);
    try {
      await fn();
    } catch (e) {
      setError(e.message || "Ошибка");
      showToast(e.message || "Ошибка", "error");
    } finally {
      setLoading(false);
    }
  };

  const rebuildFromPlan = () =>
    run(async () => {
      await apiPost("/api/shopping/build", { user_id: userId, days: cartDays });
      await loadCart();
      showToast("Корзина обновлена по плану", "success");
      setMode("view");
    });

  const toggleSkip = (item) =>
    run(async () => {
      await apiPatch(`/api/shopping/items/${item.id}`, {
        user_id: userId,
        skipped_in_trip: !item.skipped_in_trip,
      });
      await loadCart();
    });

  const removeLine = (id) =>
    run(async () => {
      await apiDelete(`/api/shopping/items/${id}`, { user_id: userId });
      await loadCart();
      showToast("Позиция удалена", "neutral");
    });

  const saveLineModal = async (payload) => {
    const { kind, item, forDate } = lineModal || {};
    await run(async () => {
      if (kind === "add") {
        if (!forDate) {
          showToast("Выберите день для позиции", "error");
          return;
        }
        await apiPost("/api/shopping/items", {
          user_id: userId,
          name: payload.name,
          amount: payload.amount,
          unit: payload.unit,
          estimated_cost:
            typeof payload.estimated_cost === "number" && payload.estimated_cost >= 0
              ? payload.estimated_cost
              : undefined,
          for_date: forDate,
        });
        showToast("Добавлено", "success");
      } else if (kind === "edit" && item) {
        const body = {
          user_id: userId,
          name: payload.name,
          amount_needed: payload.amount,
          unit: payload.unit,
        };
        if (typeof payload.estimated_cost === "number" && payload.estimated_cost >= 0) {
          body.estimated_cost = payload.estimated_cost;
        }
        await apiPatch(`/api/shopping/items/${item.id}`, body);
        showToast("Сохранено", "success");
      }
      setLineModal(null);
      await loadCart();
    });
  };

  const completeTrip = () =>
    run(async () => {
      const res = await apiPost("/api/shopping/complete", { user_id: userId });
      setMode("view");
      await loadCart();
      showToast(`Учтено ~${Math.round(res.spent_recorded || 0)} ₽`, "success");
      if (res.skipped_count > 0 && (res.skipped_names || []).length) {
        setReplanModal({ names: res.skipped_names, message: res.message || "" });
      }
    });

  const confirmReplan = (yes) =>
    run(async () => {
      if (yes) {
        await apiPost("/api/shopping/dialog-replan", { user_id: userId });
        showToast("Запрос на пересчёт плана принят (пока заглушка)", "info");
      }
      setReplanModal(null);
    });

  return (
    <div className="content">
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>{headline}</div>
        {mode === "view" && (
          <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
            Окно плана:{" "}
            <select
              value={cartDays}
              onChange={(e) => setCartDays(Number(e.target.value))}
              style={{
                borderRadius: 8,
                padding: "4px 8px",
                border: "1px solid var(--c-border)",
                background: "var(--c-surface)",
                color: "var(--c-text-primary)",
              }}
            >
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <option key={d} value={d}>
                  {d} {d === 1 ? "день" : "дня"}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && (
          <div style={{ color: "var(--c-danger)", fontSize: 14, marginBottom: 8 }}>{error}</div>
        )}

        {mode === "view" && (
          <button
            type="button"
            className="pill-btn pill-btn-ghost"
            style={{ width: "100%", marginBottom: 10 }}
            disabled={loading}
            onClick={rebuildFromPlan}
          >
            Обновить корзину по плану
          </button>
        )}
      </div>

      {!cart?.empty && dates.length > 0 && (
        <>
          {dates.map((d) => (
            <div key={d}>
              <div className="section-title section-title--date">
                На <strong>{fmtDay(d)}</strong>
              </div>
              <div className="card" style={{ padding: 0 }}>
                {(grouped[d] || []).map((item) => (
                  <ShoppingRow
                    key={item.id}
                    item={item}
                    mode={mode}
                    onToggleSkip={() => toggleSkip(item)}
                    onEdit={() => setLineModal({ kind: "edit", item, forDate: d })}
                    onDelete={() => removeLine(item.id)}
                  />
                ))}
              </div>
              {mode === "trip" && (
                <button
                  type="button"
                  className="pill-btn pill-btn-ghost"
                  style={{ width: "100%", marginTop: 8 }}
                  disabled={loading}
                  onClick={() => setLineModal({ kind: "add", forDate: d })}
                >
                  + Добавить свою покупку
                </button>
              )}
              {mode === "edit" && (
                <button
                  type="button"
                  className="pill-btn pill-btn-ghost"
                  style={{ width: "100%", marginTop: 8 }}
                  disabled={loading}
                  onClick={() => setLineModal({ kind: "add", forDate: d })}
                >
                  + Добавить позицию на этот день
                </button>
              )}
            </div>
          ))}
        </>
      )}

      {cart?.empty && !error && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 700 }}>Корзина пуста</div>
          <div className="muted" style={{ marginBottom: 12 }}>
            Сгенерируй план или нажми «Обновить корзину», чтобы собрать список из ближайших дней.
          </div>
          <button
            type="button"
            className="pill-btn pill-btn-primary"
            disabled={loading}
            onClick={rebuildFromPlan}
          >
            Обновить корзину
          </button>
        </div>
      )}

      <div
        className="card"
        style={{
          padding: 16,
          marginTop: 12,
          borderColor: overBudget ? "var(--c-danger)" : undefined,
          boxShadow: overBudget ? "0 0 0 1px color-mix(in srgb, var(--c-danger) 35%, transparent)" : undefined,
        }}
      >
        <div className="kpi">{mode === "trip" ? "Сумма по отмеченным позициям" : "Итого (оценка)"}</div>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
          {ruMoney(mode === "trip" ? tripTotal : viewTotal)}
        </div>
        {budget != null && Number(budget) > 0 && (
          <>
            <div className="muted" style={{ fontSize: 13 }}>
              Лимит на неделю: {Math.round(Number(budget)).toLocaleString("ru-RU")} ₽
            </div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: overBudget ? "var(--c-danger)" : "var(--c-text-primary)",
                marginTop: 4,
              }}
            >
              Остаток:{" "}
              {remainder == null ? "—" : `${Math.round(remainder).toLocaleString("ru-RU")} ₽`}
            </div>
          </>
        )}
      </div>

      {mode === "view" && !cart?.empty && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
          <button
            type="button"
            className="pill-btn pill-btn-primary"
            disabled={loading}
            onClick={() => setMode("trip")}
          >
            Начать закупку
          </button>
          <button
            type="button"
            className="pill-btn pill-btn-ghost"
            disabled={loading}
            onClick={() => setMode("edit")}
          >
            Редактировать список
          </button>
        </div>
      )}

      {mode === "trip" && !cart?.empty && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
          <button
            type="button"
            className="pill-btn pill-btn-primary"
            disabled={loading}
            onClick={completeTrip}
          >
            Завершить и разобрать
          </button>
          <button
            type="button"
            className="pill-btn pill-btn-ghost"
            disabled={loading}
            onClick={() => setMode("view")}
          >
            Вернуться к просмотру
          </button>
        </div>
      )}

      {mode === "edit" && !cart?.empty && (
        <button
          type="button"
          className="pill-btn pill-btn-ghost"
          style={{ width: "100%", marginTop: 14 }}
          disabled={loading}
          onClick={() => setMode("view")}
        >
          Готово
        </button>
      )}

      {lineModal && (
        <LineModal
          key={`${lineModal.kind}-${lineModal.item?.id ?? "new"}-${lineModal.forDate ?? ""}`}
          title={lineModal.kind === "add" ? "Своя покупка" : "Изменить позицию"}
          initial={
            lineModal.kind === "edit" && lineModal.item
              ? {
                  name: lineModal.item.name || "",
                  amount: lineModal.item.amount_needed,
                  unit: lineModal.item.unit || "г",
                  estimated_cost: lineModal.item.estimated_cost,
                }
              : { name: "", amount: "", unit: "г", estimated_cost: "" }
          }
          onClose={() => setLineModal(null)}
          onSave={saveLineModal}
        />
      )}

      {replanModal && (
        <div className="modal-backdrop" role="presentation" onClick={() => setReplanModal(null)}>
          <div className="modal-dialog" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-body">
              <div className="modal-title modal-title--notice" style={{ marginBottom: 8 }}>
                Не куплено
              </div>
              <div className="muted" style={{ marginBottom: 12, fontSize: 14 }}>
                {replanModal.names.join(", ")}
              </div>
              {replanModal.message && (
                <div style={{ fontSize: 13, marginBottom: 14 }}>{replanModal.message}</div>
              )}
              <div style={{ fontWeight: 600, marginBottom: 12 }}>
                Пересчитать план без этих продуктов?
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" className="pill-btn pill-btn-primary" onClick={() => confirmReplan(true)}>
                  Да
                </button>
                <button type="button" className="pill-btn pill-btn-ghost" onClick={() => confirmReplan(false)}>
                  Нет
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ShoppingRow({ item, mode, onToggleSkip, onEdit, onDelete }) {
  const green = !item.skipped_in_trip;
  const strike = mode === "trip" && item.skipped_in_trip;

  return (
    <div
      className="list-item"
      style={{
        alignItems: "flex-start",
        flexDirection: "column",
        gap: 10,
        borderLeft: mode === "trip" ? `4px solid ${green ? "#2e7d32" : "var(--c-danger)"}` : undefined,
        paddingLeft: mode === "trip" ? 12 : undefined,
      }}
    >
      <div style={{ display: "flex", width: "100%", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              textDecoration: strike ? "line-through" : "none",
              opacity: strike ? 0.72 : 1,
            }}
          >
            {item.is_manual ? <span className="manual-pill">Своё</span> : null}
            {item.name}
          </div>
          <div className="kpi">
            {item.amount_needed} {item.unit} · {ruMoney(item.estimated_cost)}
          </div>
        </div>
      </div>

      {mode === "trip" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, width: "100%" }}>
          <button type="button" className="pill-btn pill-btn-ghost" style={{ flex: 1, minWidth: 120 }} onClick={onToggleSkip}>
            Не купил
          </button>
          <button type="button" className="pill-btn pill-btn-ghost" style={{ flex: 1, minWidth: 120 }} onClick={onEdit}>
            Изменить
          </button>
        </div>
      )}

      {mode === "edit" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" className="pill-btn pill-btn-ghost" onClick={onEdit}>
            Изменить
          </button>
          <button type="button" className="pill-btn pill-btn-ghost" onClick={onDelete}>
            Удалить
          </button>
        </div>
      )}
    </div>
  );
}

function LineModal({ title, initial, onClose, onSave }) {
  const [name, setName] = useState(initial.name);
  const [amount, setAmount] = useState(initial.amount === "" ? "" : String(initial.amount));
  const [unit, setUnit] = useState(initial.unit || "г");
  const [price, setPrice] = useState(
    initial.estimated_cost === "" || initial.estimated_cost == null
      ? ""
      : String(initial.estimated_cost),
  );

  const submit = (e) => {
    e.preventDefault();
    const a = parseFloat(String(amount).replace(",", "."));
    const p = parseFloat(String(price).replace(",", "."));
    if (!name.trim() || !(a > 0)) return;
    onSave({
      name: name.trim(),
      amount: a,
      unit,
      estimated_cost: Number.isFinite(p) && p >= 0 ? p : undefined,
    });
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-dialog" role="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-head-text">
            <h2 className="modal-title">{title}</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <div className="modal-body">
          <form className="modal-stack" onSubmit={submit}>
            <div className="field-group">
              <label className="field-label" htmlFor="shop-line-name">
                Название
              </label>
              <input
                id="shop-line-name"
                className="form-text-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например, куриная грудка"
                autoComplete="off"
              />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <div className="field-group" style={{ flex: 1 }}>
                <label className="field-label" htmlFor="shop-line-amt">
                  Кол-во
                </label>
                <input
                  id="shop-line-amt"
                  className="form-text-input"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="field-group" style={{ width: 110 }}>
                <label className="field-label" htmlFor="shop-line-unit">
                  Единица
                </label>
                <div className="modal-select-wrap">
                  <select
                    id="shop-line-unit"
                    className="modal-select"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                  >
                    {UNIT_OPTIONS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="shop-line-price">
                Цена (₽ за строку, опционально)
              </label>
              <input
                id="shop-line-price"
                className="form-text-input"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Авто по справочнику"
              />
            </div>
            <button type="submit" className="pill-btn pill-btn-primary modal-stack-submit">
              Сохранить
            </button>
            <button type="button" className="pill-btn pill-btn-ghost modal-stack-secondary" onClick={onClose}>
              Отмена
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
