import { useEffect, useMemo, useState } from "react";
import { PillButton, SkeletonList, EmptyState } from "../components/ui";
import { apiGet } from "../api/client";

export default function PantryTab({ showToast, userId }) {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const data = await apiGet("/api/pantry", { user_id: userId });
        setProducts(data);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId]);

  const filtered = useMemo(
    () => products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())),
    [products, query]
  );

  if (loading) return <SkeletonList count={6} />;

  return (
    <div className="animate-fade-up">
      {/* Search */}
      <div
        className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 mb-4"
        style={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border)" }}
      >
        <span className="text-[16px]">🔍</span>
        <input
          type="text"
          placeholder="Поиск продуктов..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 bg-transparent outline-none text-[14px] font-semibold placeholder-[var(--tg-muted)]"
          style={{ color: "var(--tg-text)", fontFamily: "inherit", border: "none" }}
        />
        {query && (
          <button onClick={() => setQuery("")} className="text-[14px] cursor-pointer" style={{ color: "var(--tg-muted)", background: "none", border: "none" }}>✕</button>
        )}
      </div>

      {error && <div className="text-sm mb-3" style={{ color: "#ff6584" }}>{error}</div>}
      {filtered.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="Ничего не найдено"
          desc="Попробуйте изменить запрос или категорию"
        />
      ) : (
        filtered.map((p) => (
          <div key={p.id} className="rounded-2xl px-4 py-3 mb-2" style={{ background: "var(--tg-surface)", border: "1px solid var(--tg-border)" }}>
            <div className="text-[14px] font-bold" style={{ color: "var(--tg-text)" }}>{p.name}</div>
            <div className="text-[12px]" style={{ color: "var(--tg-muted)" }}>
              {p.amount} {p.unit} · {p.calories_per_100} ккал/100
            </div>
          </div>
        ))
      )}

      <PillButton onClick={() => showToast("ℹ️", "Добавление через API будет следующим шагом")}>
        ➕ Добавить продукт (скоро)
      </PillButton>
    </div>
  );
}
