import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet } from "../api/client";
import { IconCloseSmall, IconSearch } from "../components/ui-icons";

/** Ориентиры «низкий запас» по типу единицы (без единого числа вроде 200 для всех позиций). */
const LOW_STOCK_GRAMS = 150;
const LOW_STOCK_ML = 200;
const LOW_STOCK_PIECES = 3;

/**
 * @returns {null | { label: string, title: string }} — бейдж только если нужно привлечь внимание
 */
function pantryLowStockBadge(amount, rawUnit) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) {
    return {
      label: "Пусто",
      title: "Остаток нулевой или не указан — позиция не учитывается в запасе.",
    };
  }

  const u = String(rawUnit || "г")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");

  const isMassG =
    u === "г" || u === "гр" || u === "грамм" || u === "граммов" || u === "g" || u === "г." || u === "гр.";
  const isMassKg = u === "кг" || u === "kg";
  const isMl = u === "мл" || u === "ml";
  const isL = u === "л" || u === "l";
  const isPieces =
    u === "шт" ||
    u === "штук" ||
    u === "штука" ||
    u === "pcs" ||
    u === "pc" ||
    u.startsWith("шт");

  let comparable = null;
  let unitHint = "";

  if (isMassG) {
    comparable = n;
    unitHint = `${LOW_STOCK_GRAMS} г`;
  } else if (isMassKg) {
    comparable = n * 1000;
    unitHint = `${LOW_STOCK_GRAMS} г`;
  } else if (isMl) {
    comparable = n;
    unitHint = `${LOW_STOCK_ML} мл`;
  } else if (isL) {
    comparable = n * 1000;
    unitHint = `${LOW_STOCK_ML} мл`;
  } else if (isPieces) {
    if (n < LOW_STOCK_PIECES) {
      return {
        label: "Мало",
        title: `Меньше ${LOW_STOCK_PIECES} шт. — при необходимости пополните запас.`,
      };
    }
    return null;
  } else {
    return null;
  }

  if (comparable == null) return null;

  const limit =
    isMassG || isMassKg ? LOW_STOCK_GRAMS : LOW_STOCK_ML;
  if (comparable < limit) {
    return {
      label: "Мало",
      title: `Ориентировочно низкий остаток: меньше ${unitHint}. Точный порог подстраивается под единицу товара (не персонально под ваш рацион).`,
    };
  }

  return null;
}

export default function PantryTab({ showToast, userId }) {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState("");

  const loadPantry = useCallback(async (opts) => {
    const soft = opts?.soft === true;
    if (userId == null || userId === "") {
      setProducts([]);
      setLoading(false);
      return;
    }
    try {
      if (!soft) setLoading(true);
      setError("");
      const data = await apiGet("/api/pantry", { user_id: userId });
      setProducts(data);
    } catch (e) {
      setError(e.message);
    } finally {
      if (!soft) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadPantry();
  }, [loadPantry]);

  const clearPantry = async () => {
    if (userId == null || userId === "" || products.length === 0) return;
    if (
      !window.confirm(
        "Удалить все позиции из кладовой? Резервы под план для этого аккаунта тоже сбросятся. Действие нельзя отменить.",
      )
    ) {
      return;
    }
    setClearing(true);
    try {
      await apiDelete("/api/pantry", { user_id: userId });
      await loadPantry({ soft: true });
      showToast("Кладовая очищена", "success");
    } catch (e) {
      showToast(e.message || "Ошибка", "error");
    } finally {
      setClearing(false);
    }
  };

  const filtered = useMemo(
    () => products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())),
    [products, query]
  );

  if (loading) return <div className="content"><div className="card" style={{ padding: 16 }}>Загружаем кладовую...</div></div>;

  return (
    <div className="content">
      <div className="section-title">Запасы на сегодня</div>
      <div className="card" style={{ padding: 10, display: "flex", gap: 10, alignItems: "center" }}>
        <span className="pantry-search-icon" aria-hidden>
          <IconSearch size={18} />
        </span>
        <input
          type="text"
          placeholder="Поиск продуктов..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--c-text-primary)" }}
        />
        {query && (
          <button
            type="button"
            className="icon-btn icon-btn--svg"
            onClick={() => setQuery("")}
            aria-label="Очистить поиск"
            style={{ width: 32, height: 32, flexShrink: 0 }}
          >
            <IconCloseSmall size={16} />
          </button>
        )}
      </div>

      {error && (
        <div className="card" style={{ padding: 12, color: "var(--c-danger)" }}>
          {error}
        </div>
      )}
      {products.length === 0 ? (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 700 }}>Кладовая пуста</div>
          <div className="muted">Добавьте продукты, когда появится возможность.</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 700 }}>Ничего не найдено</div>
          <div className="muted">Попробуйте изменить запрос.</div>
        </div>
      ) : (
        <div className="card">
          {filtered.map((p) => {
            const stockBadge = pantryLowStockBadge(p.amount, p.unit);
            return (
              <div key={p.id} className="list-item">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, lineHeight: 1.35 }}>
                    {p.name}
                    <span style={{ fontWeight: 500, color: "var(--c-text-secondary)" }}>
                      {" "}
                      ·{" "}
                      {Number(p.amount) % 1 === 0 ? Math.round(Number(p.amount)) : p.amount}
                      &nbsp;{p.unit}
                    </span>
                  </div>
                </div>
                {stockBadge ? (
                  <span
                    className={`badge${stockBadge.label === "Пусто" ? " badge--empty" : " badge--warn"}`}
                    title={stockBadge.title}
                  >
                    {stockBadge.label}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
        <button
          type="button"
          className="pill-btn pill-btn-ghost"
          onClick={() => showToast("Добавление через API будет следующим шагом", "info")}
        >
          Добавить продукт
        </button>
        {products.length > 0 && (
          <button
            type="button"
            className="pill-btn pill-btn-ghost"
            disabled={clearing || loading}
            onClick={clearPantry}
            style={{ color: "var(--c-danger)" }}
          >
            Очистить кладовую
          </button>
        )}
      </div>
    </div>
  );
}
