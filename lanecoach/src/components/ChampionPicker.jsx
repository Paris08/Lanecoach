import { useEffect, useMemo, useRef, useState } from "react";
import { img } from "../ddragon.js";

const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export default function ChampionPicker({ label, hint, champions, version, value, onChange, exclude, placeholder }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const selected = champions.find((c) => c.id === value);

  const filtered = useMemo(() => {
    const q = norm(query);
    const list = champions.filter((c) => c.id !== exclude);
    if (!q) return list;
    const starts = [], contains = [];
    for (const c of list) {
      const n = norm(c.name), i = norm(c.id);
      if (n.startsWith(q) || i.startsWith(q)) starts.push(c);
      else if (n.includes(q) || i.includes(q)) contains.push(c);
    }
    return [...starts, ...contains];
  }, [query, champions, exclude]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    const close = (e) => wrapRef.current && !wrapRef.current.contains(e.target) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  useEffect(() => {
    const el = listRef.current?.children[active];
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (c) => {
    onChange(c.id);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && open && filtered[active]) { e.preventDefault(); pick(filtered[active]); }
    else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div className="field" ref={wrapRef}>
      <label className="field-label">
        {label} {hint && <span className="field-hint">{hint}</span>}
      </label>
      <div className={`picker ${open ? "is-open" : ""}`}>
        {selected && !open ? (
          <button type="button" className="picker-selected" onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}>
            <img src={img.champ(version, selected.id)} alt="" />
            <span>
              <strong>{selected.name}</strong>
              <small>{selected.title}</small>
            </span>
          </button>
        ) : (
          <input
            ref={inputRef}
            className="picker-input"
            value={query}
            placeholder={placeholder}
            onFocus={() => setOpen(true)}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onKeyDown={onKey}
            autoComplete="off"
            spellCheck="false"
          />
        )}
        {selected && (
          <button type="button" className="picker-clear" aria-label="Auswahl entfernen" onClick={() => { onChange(""); setQuery(""); }}>
            ×
          </button>
        )}
        {open && (
          <ul className="picker-list" ref={listRef} role="listbox">
            {filtered.length === 0 && <li className="picker-empty">Kein Champion gefunden</li>}
            {filtered.map((c, i) => (
              <li
                key={c.id}
                role="option"
                aria-selected={i === active}
                className={i === active ? "active" : ""}
                onPointerEnter={() => setActive(i)}
                onPointerDown={(e) => { e.preventDefault(); pick(c); }}
              >
                <img src={img.champ(version, c.id)} alt="" loading="lazy" />
                <span>{c.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
