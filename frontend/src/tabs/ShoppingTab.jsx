import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost, apiPatch } from "../api/client";

const UNIT_OPTIONS = ["г", "мл", "шт", "кг"];

function fmtDay(iso) {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function fmtRangeHeading(dates) {
  const ds = [...(dates || [])].sort();
  if (!ds.length) return "";
  if (ds.length === 1) return `На ${fmtDay(ds[0])}`;
  return `${fmtDay(ds[0])} — ${fmtDay(ds[ds.length - 1])}`;
}

function ruMoney(n) {
  const v = Math.round(Number(n) || 0);
  return `~${v.toLocaleString("ru-RU")} ₽`;
}

/** 1 позиция / 2 позиции / 5 позиций */
function pluralPositions(n) {
  const k = Math.abs(Number(n)) % 100;
  const k1 = k % 10;
  if (k > 10 && k < 20) return "позиций";
  if (k1 > 1 && k1 < 5) return "позиции";
  if (k1 === 1) return "позиция";
  return "позиций";
}

function emptyShoppingTitle(code) {
  switch (code) {
    case "all_in_pantry":
      return "Запасов хватает";
    case "not_built":
      return "Список не собран";
    case "no_ingredients":
      return "В плане нет состава";
    case "no_plan":
    default:
      return "Нет плана на эти дни";
  }
}

function shoppingListModeHint(apiMode) {
  if (apiMode === "ai_packs") return "Режим корзины: ИИ с упаковками (последняя генерация плана).";
  if (apiMode === "legacy_rebuild") return "Режим корзины: классический пересчёт из плана.";
  return null;
}

function emptyShoppingBody(code) {
  switch (code) {
    case "all_in_pantry":
      return "План на выбранные дни есть, покупки по нему не нужны — всё уже в кладовой.";
    case "not_built":
      return "По плану есть что купить, но список ещё не создан. Нажмите «Пересобрать из плана» выше.";
    case "no_ingredients":
      return "Обновите план во вкладке «Сегодня», затем снова пересоберите список.";
    case "no_plan":
    default:
      return "Сначала план во вкладке «Сегодня», затем «Пересобрать из плана».";
  }
}

export default function ShoppingTab({ showToast, userId }) {
  const [mode, setMode] = useState("view"); // view | trip
  const [cartDays, setCartDays] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cart, setCart] = useState(null);
  const [isCartFetching, setIsCartFetching] = useState(false);
  const [lineModal, setLineModal] = useState(null);
  const [replanModal, setReplanModal] = useState(null);
  /** После первого успешного GET для userId — смена «дней из плана» без строки «Загрузка списка…», чтобы не дёргалась вёрстка. */
  const hadCartLoadedRef = useRef(false);

  const loadCart = useCallback(async (opts) => {
    let silent;
    if (opts?.silent === true) silent = true;
    else if (opts?.silent === false) silent = false;
    else silent = hadCartLoadedRef.current;

    if (userId == null || userId === "") return;
    if (!silent) setIsCartFetching(true);
    setError("");
    try {
      const data = await apiGet("/api/shopping", { user_id: userId, days: cartDays });
      setCart(data);
      hadCartLoadedRef.current = true;
    } catch (e) {
      setError(e.message || "Ошибка");
    } finally {
      if (!silent) setIsCartFetching(false);
    }
  }, [userId, cartDays]);

  useEffect(() => {
    hadCartLoadedRef.current = false;
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load on mount / userId / cartDays
    loadCart();
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
    if (mode === "trip") return "В магазине";
    const range = fmtRangeHeading(dates);
    return range ? `Список покупок · ${range}` : "Список покупок";
  }, [mode, dates]);

  const cartModeHint = shoppingListModeHint(cart?.shopping_list_mode);

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
      const stats = await apiPost("/api/shopping/build", { user_id: userId, days: cartDays });
      await loadCart({ silent: true });
      const n = Number(stats?.inserted_lines) || 0;
      if (n > 0 && stats?.from_date && stats?.to_date) {
        showToast(
          `${n} ${pluralPositions(n)} · ${fmtDay(stats.from_date)} — ${fmtDay(stats.to_date)}`,
          "success",
        );
      } else {
        showToast("Список пуст: для этих дней нечего покупать или нет плана.", "neutral");
      }
      setMode("view");
    });

  const toggleSkip = (item) => {
    (async () => {
      try {
        await apiPatch(`/api/shopping/items/${item.id}`, {
          user_id: userId,
          skipped_in_trip: !item.skipped_in_trip,
        });
        await loadCart({ silent: true });
      } catch (e) {
        showToast(e.message || "Ошибка", "error");
      }
    })();
  };

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
      await loadCart({ silent: true });
    });
  };

  const completeTrip = () =>
    run(async () => {
      const res = await apiPost("/api/shopping/complete", { user_id: userId });
      setMode("view");
      await loadCart({ silent: true });
      showToast(`Учтено ~${Math.round(res.spent_recorded || 0)} ₽`, "success");
      if (res.skipped_count > 0 && (res.skipped_names || []).length) {
        setReplanModal({ names: res.skipped_names });
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
    <div className={`content${mode === "trip" ? " content--shopping-trip" : ""}`}>
      <div className={`card${mode === "trip" ? " shopping-trip-topcard" : ""}`} style={{ padding: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>{headline}</div>
        {cartModeHint ? (
          <p className="muted" style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.4, margin: "0 0 10px" }}>
            {cartModeHint}
          </p>
        ) : null}
        {mode === "view" && dates.length > 0 && !cart?.empty && (
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.45, margin: "0 0 12px" }}>
            Даты ниже — из плана. Пересборка заменяет весь список.
          </p>
        )}
        {isCartFetching && (
          <p className="muted" style={{ fontSize: 14, margin: "0 0 12px" }}>
            Загрузка списка…
          </p>
        )}
        {mode === "view" && (
          <div className="cart-window-field">
            <span className="cart-window-label" id="cart-window-label">
              Дней из плана
            </span>
            <p className="muted cart-window-sublabel">С сегодняшнего дня</p>
            <div className="cart-window-segment" role="radiogroup" aria-labelledby="cart-window-label">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={cartDays === d}
                  className={`cart-window-day${cartDays === d ? " cart-window-day--active" : ""}`}
                  onClick={() => setCartDays(d)}
                  disabled={loading || isCartFetching}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div style={{ color: "var(--c-danger)", fontSize: 14, marginBottom: 8 }}>{error}</div>
        )}

        {mode === "view" && (
          <button
            type="button"
            className={cart?.empty ? "pill-btn pill-btn-primary" : "pill-btn pill-btn-ghost"}
            style={{ width: "100%", marginBottom: 0 }}
            disabled={loading || isCartFetching}
            onClick={rebuildFromPlan}
          >
            Пересобрать из плана
          </button>
        )}
      </div>

      {cart?.empty && !error && (
        <>
          <div className="section-title section-title--date">Покупки</div>
          <div className="card shopping-empty-list" style={{ padding: 0 }}>
            <div className="list-item shopping-empty-list__row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{emptyShoppingTitle(cart?.empty_hint)}</div>
                <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
                  {emptyShoppingBody(cart?.empty_hint)}
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {!cart?.empty && dates.length > 0 && (
        <>
          {dates.map((d) => (
            <div key={d}>
              <div className="section-title section-title--date">
                На <strong>{fmtDay(d)}</strong>
              </div>
              <div className={`card${mode === "trip" ? " shopping-trip-day-card" : ""}`} style={{ padding: 0 }}>
                {(grouped[d] || []).map((item) => (
                  <ShoppingRow
                    key={item.id}
                    item={item}
                    mode={mode}
                    onToggleSkip={() => toggleSkip(item)}
                    onEdit={() => setLineModal({ kind: "edit", item, forDate: d })}
                  />
                ))}
              </div>
              {mode === "trip" && (
                <button
                  type="button"
                  className="pill-btn pill-btn-ghost shopping-trip-add-line"
                  disabled={loading}
                  onClick={() => setLineModal({ kind: "add", forDate: d })}
                >
                  + Добавить в список
                </button>
              )}
            </div>
          ))}
        </>
      )}

      {cart != null && !cart.empty && (
        <div
          className={`card${mode === "trip" ? " shopping-trip-total-card" : ""}`}
          style={{
            padding: 16,
            marginTop: 12,
            borderColor: overBudget ? "var(--c-danger)" : undefined,
            boxShadow: overBudget ? "0 0 0 1px color-mix(in srgb, var(--c-danger) 35%, transparent)" : undefined,
          }}
        >
          <div className="kpi">{mode === "trip" ? "К покупке (оценка)" : "Итого по списку (оценка)"}</div>
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
      )}

      {mode === "view" && !cart?.empty && (
        <button
          type="button"
          className="pill-btn pill-btn-primary"
          style={{ width: "100%", marginTop: 14 }}
          disabled={loading}
          onClick={() => setMode("trip")}
        >
          Режим магазина
        </button>
      )}

      {mode === "trip" && !cart?.empty && (
        <div className="shopping-trip-footer">
          <div className="shopping-trip-footer__btns">
            <button type="button" className="pill-btn pill-btn-primary" disabled={loading} onClick={completeTrip}>
              Завершить и внести в кладовую
            </button>
            <button type="button" className="pill-btn pill-btn-ghost" disabled={loading} onClick={() => setMode("view")}>
              Назад к списку
            </button>
          </div>
        </div>
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
          <div className="modal-dialog modal-dialog--replan" role="dialog" aria-labelledby="replan-modal-title" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-head-text">
                <h2 className="modal-title modal-title--notice" id="replan-modal-title">
                  Не куплено
                </h2>
              </div>
              <button type="button" className="modal-close" onClick={() => setReplanModal(null)} aria-label="Закрыть">
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-stack replan-modal-stack">
                <div className="replan-modal-skipped">{replanModal.names.join(", ")}</div>
                <p className="replan-modal-prompt">Пересчитать план без этих продуктов?</p>
                <div className="replan-modal-actions">
                  <button type="button" className="pill-btn pill-btn-primary replan-modal-actions__btn" onClick={() => confirmReplan(true)}>
                    Да
                  </button>
                  <button type="button" className="pill-btn pill-btn-ghost replan-modal-actions__btn" onClick={() => confirmReplan(false)}>
                    Нет
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ShoppingRow({ item, mode, onToggleSkip, onEdit }) {
  const skipped = mode === "trip" && item.skipped_in_trip;
  const tripClasses =
    mode === "trip"
      ? `list-item shopping-trip-row${skipped ? " shopping-trip-row--skipped" : " shopping-trip-row--active"}`
      : "list-item";

  return (
    <div className={tripClasses}>
      <div className="shopping-trip-row__main">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="shopping-trip-row__title" style={{ fontWeight: 700 }}>
            {item.is_manual ? <span className="manual-pill">Своё</span> : null}
            {item.name}
          </div>
          <div className="shopping-trip-row__meta">
            {item.packs > 0 && item.pack_weight > 0 ? (
              <>
                <div className="kpi" style={{ fontWeight: 600 }}>
                  {item.packs}×{item.pack_weight} {item.pack_unit || item.unit} · {ruMoney(item.estimated_cost)}
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2, lineHeight: 1.35 }}>
                  в плане {item.amount_needed} {item.unit}
                </div>
              </>
            ) : (
              <div className="kpi" style={{ fontWeight: 600 }}>
                {ruMoney(item.estimated_cost)}
              </div>
            )}
          </div>
        </div>
      </div>

      {mode === "trip" && (
        <div className="shopping-trip-row__actions">
          <button type="button" className="pill-btn pill-btn-ghost shopping-trip-btn-notake" onClick={onToggleSkip}>
            {skipped ? "Вернуть" : "Не взял"}
          </button>
          <button type="button" className="pill-btn pill-btn-ghost shopping-trip-btn-edit" onClick={onEdit}>
            Изменить
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
