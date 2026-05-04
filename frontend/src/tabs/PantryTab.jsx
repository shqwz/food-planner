import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet } from "../api/client";
import { IconCloseSmall, IconSearch } from "../components/ui-icons";

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
          {filtered.map((p) => (
            <div key={p.id} className="list-item">
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                <div className="kpi">{p.amount} {p.unit} · {p.calories_per_100} ккал/100</div>
              </div>
              <span className="badge">{Number(p.amount) > 200 ? "Есть" : "Мало"}</span>
            </div>
          ))}
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
