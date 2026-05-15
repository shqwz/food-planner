import {
  IconSearch,
  IconStockCalendar,
  IconStockCart,
  IconStockCheck,
  IconStockList,
  IconStockPantry,
} from "./ui-icons";

const GLYPHS = {
  pantry: IconStockPantry,
  search: IconSearch,
  check: IconStockCheck,
  cart: IconStockCart,
  list: IconStockList,
  calendar: IconStockCalendar,
};

export default function StockEmptyGlyph({ variant = "pantry", className = "" }) {
  const Icon = GLYPHS[variant] || IconStockPantry;
  return (
    <span className={`stock-empty__glyph${className ? ` ${className}` : ""}`} aria-hidden>
      <Icon size={28} />
    </span>
  );
}
