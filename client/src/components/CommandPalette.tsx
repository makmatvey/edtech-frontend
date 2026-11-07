import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { BookMarked, CornerDownLeft, Loader2, Search, X } from "lucide-react";
import { api } from "../lib/api";
import type { Role } from "../lib/auth";
import { fmtDayShort } from "../lib/format";
import { Avatar } from "./ui";
import { useEscapeLayer } from "../lib/layers";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type PaletteNav = { to: string; label: string; icon: ReactNode; keywords?: string };

type SearchResult = {
  students: { id: number; fullName: string; className: string }[];
  topics: { lessonId: number; date: string; title: string; subject: string; className: string }[];
};
type Entry = { key: string; group: string; to: string; icon: ReactNode; title: string; sub?: string };

/** Нормализация для поиска: регистр и «ё» не важны (длина строки сохраняется — для подсветки). */
const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е");

function Highlight({ text, q }: { text: string; q: string }) {
  const n = norm(q.trim());
  if (!n) return <>{text}</>;
  const i = norm(text).indexOf(n);
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="cmdk-hl">{text.slice(i, i + n.length)}</mark>{text.slice(i + n.length)}</>;
}

/** «Фамилия Имя Отчество» → «Имя Фамилия» — как в остальных списках */
const shortOf = (full: string) => { const p = full.split(" "); return p.length > 1 ? `${p[1]} ${p[0]}` : full; };

export const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

/** Быстрый переход (Ctrl/⌘+K, «/»): разделы, а для учителя — ученики и темы уроков. */
export function CommandPalette({ role, nav, onClose }: { role: Role; nav: PaletteNav[]; onClose: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const teacher = role === "teacher";
  const term = q.trim();

  // Фокус, блокировка прокрутки страницы, возврат фокуса после закрытия
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    input.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, []);

  // Поиск на сервере с задержкой 200 мс; устаревшие запросы отменяем
  useEffect(() => {
    if (!teacher || term.length < 2) { setRemote(null); setLoading(false); setFailed(false); return; }
    const c = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      api<SearchResult>(`/teacher/search?q=${encodeURIComponent(term)}`, { signal: c.signal })
        .then((r) => { setRemote(r); setFailed(false); })
        .catch((e) => { if ((e as Error).name !== "AbortError") { setRemote(null); setFailed(true); } })
        .finally(() => { if (!c.signal.aborted) setLoading(false); });
    }, 200);
    return () => { clearTimeout(t); c.abort(); };
  }, [term, teacher]);

  const entries = useMemo<Entry[]>(() => {
    const n = norm(term);
    const pages = nav
      .filter((i) => !n || norm(`${i.label} ${i.keywords ?? ""}`).includes(n))
      .map((i) => ({ key: `p:${i.to}`, group: "Разделы", to: i.to, icon: i.icon, title: i.label }));
    if (!remote || term.length < 2) return pages;
    const students = remote.students.map((s) => ({
      key: `s:${s.id}`, group: "Ученики", to: `/t/student/${s.id}`,
      icon: <Avatar name={shortOf(s.fullName)} id={s.id} size={26} />,
      title: s.fullName, sub: `${s.className} класс`,
    }));
    const topics = remote.topics.map((t) => ({
      key: `t:${t.lessonId}`, group: "Темы уроков", to: `/t/lesson/${t.lessonId}`,
      icon: <span className="cmdk-ic"><BookMarked size={15} /></span>,
      title: t.title, sub: `${t.subject} · ${t.className} · ${fmtDayShort(t.date)}`,
    }));
    // Если ищут человека или тему — разделы показываем после найденного
    return students.length || topics.length ? [...students, ...topics, ...pages] : pages;
  }, [nav, remote, term]);

  useEffect(() => { setActive(0); }, [entries]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = (e: Entry | undefined) => {
    if (!e) return;
    onClose();
    navigate(e.to);
  };

  // Esc — через общий стек слоёв: закрывается только палитра, модалка под ней остаётся
  useEscapeLayer(true, onClose);

  const onKey = (e: ReactKeyboardEvent) => {
    // Стрелки и Enter управляют списком, только пока фокус в поле поиска (Enter на кнопке «Закрыть» — закрывает)
    const inField = e.target === input.current;
    if (!inField && e.key !== "Tab") return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (entries.length ? (a + 1) % entries.length : 0)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (entries.length ? (a - 1 + entries.length) % entries.length : 0)); }
    else if (e.key === "Enter") { e.preventDefault(); go(entries[active]); }
    else if (e.key === "Tab") {
      // Ловушка фокуса: Tab / Shift+Tab ходят по элементам окна по кругу и не уводят фокус за палитру
      const items = [...(dialog.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      const cur = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (cur === first || !dialog.current?.contains(cur))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (cur === last || !dialog.current?.contains(cur))) { e.preventDefault(); first.focus(); }
    }
  };

  const waiting = teacher && term.length >= 2 && (loading || !remote) && !failed;
  let lastGroup = "";

  return (
    <div className="cmdk-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Быстрый переход" onKeyDown={onKey} ref={dialog}>
        <div className="cmdk-input">
          {waiting ? <Loader2 size={18} className="spin muted" /> : <Search size={18} className="muted" />}
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={teacher ? "Ученик, тема урока или раздел…" : "Куда перейти? Например, «оценки»"}
            role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-autocomplete="list"
            aria-activedescendant={entries[active] ? `cmdk-${active}` : undefined}
            autoComplete="off" spellCheck={false} enterKeyHint="go" />
          <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={onClose} aria-label="Закрыть"><X size={16} /></button>
        </div>
        <div className="cmdk-list" id="cmdk-list" role="listbox" aria-label="Результаты" ref={list}>
          {entries.map((e, i) => {
            const head = e.group !== lastGroup ? e.group : null;
            lastGroup = e.group;
            return (
              <div key={e.key} role="presentation">
                {head && <div className="cmdk-group" role="presentation">{head}</div>}
                <div id={`cmdk-${i}`} data-i={i} role="option" aria-selected={i === active}
                  className={`cmdk-item ${i === active ? "active" : ""}`}
                  onMouseMove={() => i !== active && setActive(i)}
                  onClick={() => go(e)}>
                  <span className="cmdk-lead">{e.icon}</span>
                  <span className="cmdk-text">
                    <span className="cmdk-title"><Highlight text={e.title} q={term} /></span>
                    {e.sub && <span className="cmdk-sub">{e.sub}</span>}
                  </span>
                  {i === active && <CornerDownLeft size={14} className="cmdk-enter" aria-hidden />}
                </div>
              </div>
            );
          })}
          {entries.length === 0 && !waiting && (
            <div className="cmdk-empty">
              {failed ? "Поиск сейчас недоступен — проверьте связь с сервером" : <>Ничего не нашлось по запросу «{term}»</>}
            </div>
          )}
          {teacher && term.length === 1 && (
            <div className="cmdk-note">Введите ещё букву — найдём учеников и темы уроков</div>
          )}
          {teacher && term.length === 0 && (
            <div className="cmdk-note">Начните вводить фамилию ученика или тему урока</div>
          )}
        </div>
        <div className="cmdk-foot" aria-hidden>
          <span><kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd> выбор</span>
          <span><kbd className="kbd">Enter</kbd> открыть</span>
          <span><kbd className="kbd">Esc</kbd> закрыть</span>
          <span className="cmdk-foot-right"><kbd className="kbd">{isMac() ? "⌘" : "Ctrl"}</kbd><kbd className="kbd">K</kbd> в любом месте</span>
        </div>
      </div>
    </div>
  );
}
