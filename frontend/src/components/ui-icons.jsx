const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function IconMoreHorizontal({ size = 20, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden {...rest}>
      <circle cx="5" cy="12" r="2" fill="currentColor" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <circle cx="19" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}

export function IconCheck({ size = 18, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden {...rest} {...stroke}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export function IconSun({ size = 20, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden {...rest} {...stroke}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

export function IconMoon({ size = 20, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden {...rest} {...stroke}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function IconSearch({ size = 18, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden {...rest} {...stroke}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4.3-4.3" />
    </svg>
  );
}

export function IconCloseSmall({ size = 18, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden {...rest} {...stroke}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

/** Пустые состояния «Запасы» — те же штрихи, что у вкладок stock-tab */
export function IconStockPantry({ size = 28, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden {...rest} {...stroke}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M5 7h14M5 11h8M5 15h5" />
    </svg>
  );
}

export function IconStockCart({ size = 28, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden {...rest} {...stroke}>
      <path d="M6 6h15l-1.5 9h-11L5 3H2" />
      <circle cx="9" cy="20" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="17" cy="20" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconStockList({ size = 28, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden {...rest} {...stroke}>
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  );
}

export function IconStockCalendar({ size = 28, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden {...rest} {...stroke}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

export function IconStockCheck({ size = 28, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden {...rest} {...stroke}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12l3 3 5-6" />
    </svg>
  );
}
