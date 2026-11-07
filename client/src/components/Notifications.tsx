import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Bell, BellOff, CalendarClock, ClipboardCheck, Flame, GraduationCap, Info, Lightbulb, NotebookPen, PenLine, RotateCw, UserX,
} from "lucide-react";
import { useApi, useLocalState } from "../lib/hooks";
import type { Role } from "../lib/auth";
import { useEscapeLayer } from "../lib/layers";

export type Notice = { id: string; kind: string; title: string; text: string; link: string; tone: "red" | "amber" | "blue" };

const KIND_ICON: Record<string, ReactNode> = {
  journal: <PenLine size={16} />,
  control: <ClipboardCheck size={16} />,
  risk: <UserX size={16} />,
  weak: <Lightbulb size={16} />,
  homework: <NotebookPen size={16} />,
  streak: <Flame size={16} />,
  grade: <GraduationCap size={16} />,
  schedule: <CalendarClock size={16} />,
};

/** Колокольчик в верхней панели: счётчик новых, выпадающий список, закрытие по Esc и клику мимо. */
export function NotificationBell({ role, userId }: { role: Role; userId: number }) {
  const state = useApi<{ items: Notice[] }>(role === "teacher" ? "/teacher/notifications" : "/student/notifications");
  const [seen, setSeen] = useLocalState<string[]>(`klasna.seen.${userId}`, []);
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const loc = useLocation();
  const first = useRef(true);
  const reload = state.reload;

  // Обновляем при каждом переходе между страницами (первую загрузку делает useApi)
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setOpen(false);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.pathname]);

  const items = state.data?.items ?? [];
  const seenSet = new Set(seen);
  const unseen = items.filter((i) => !seenSet.has(i.id)).length;

  const show = () => {
    setFresh(new Set(items.filter((i) => !seenSet.has(i.id)).map((i) => i.id)));
    if (items.length) setSeen([...new Set([...items.map((i) => i.id), ...seen])].slice(0, 300));
    setOpen(true);
    reload();
  };
  const close = (focusButton = false) => {
    setOpen(false);
    if (focusButton) btn.current?.focus();
  };

  // Клик мимо — закрыть
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Фокус на первый пункт при открытии — чтобы сразу можно было листать стрелками
  useEffect(() => {
    if (!open || !panel.current) return;
    const active = document.activeElement;
    if (active && active !== panel.current && panel.current.contains(active)) return; // пользователь уже листает
    const firstItem = panel.current.querySelector<HTMLElement>(".notif-item");
    (firstItem ?? panel.current).focus();
  }, [open, state.data]);

  // Esc — через общий стек слоёв: закрывает панель, только если она верхняя
  useEscapeLayer(open, () => close(true));

  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    const links = [...(panel.current?.querySelectorAll<HTMLElement>(".notif-item") ?? [])];
    if (!links.length) return;
    e.preventDefault();
    const i = links.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "Home" ? 0 : e.key === "End" ? links.length - 1
      : e.key === "ArrowDown" ? (i + 1) % links.length : (i - 1 + links.length) % links.length;
    links[next].focus();
  };

  return (
    <div className="notif" ref={wrap}
      onBlur={(e) => { if (open && e.relatedTarget && !wrap.current?.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <button ref={btn} type="button" className={`btn btn-sm btn-ghost btn-icon icon-btn ${open ? "on" : ""}`}
        aria-label={unseen ? `Уведомления: ${unseen} новых` : "Уведомления"} title="Уведомления"
        aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? "notif-panel" : undefined}
        onClick={() => (open ? close() : show())}>
        <Bell size={18} />
        {unseen > 0 && <span className="notif-badge" aria-hidden>{unseen > 9 ? "9+" : unseen}</span>}
      </button>
      {open && (
        <div className="popover notif-panel" id="notif-panel" role="dialog" aria-label="Уведомления" ref={panel} tabIndex={-1} onKeyDown={onKey}>
          <div className="popover-head">
            <b>Уведомления</b>
            {items.length > 0 && <span className="chip num">{items.length}</span>}
            {fresh.size > 0 && <span className="chip chip-red">{fresh.size} {fresh.size === 1 ? "новое" : "новых"}</span>}
          </div>
          {state.error && !state.data ? (
            <div className="notif-empty">
              <Info size={22} />
              <span>{state.error}</span>
              <button type="button" className="btn btn-sm" onClick={reload}><RotateCw size={14} /> Повторить</button>
            </div>
          ) : !state.data ? (
            <div className="notif-list" aria-busy="true">
              {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 52, margin: "8px 12px" }} />)}
            </div>
          ) : items.length === 0 ? (
            <div className="notif-empty">
              <BellOff size={22} />
              <span>Всё спокойно — новых уведомлений нет</span>
            </div>
          ) : (
            <ul className="notif-list">
              {items.map((n) => (
                <li key={n.id}>
                <Link to={n.link} className={`notif-item ${fresh.has(n.id) ? "fresh" : ""}`} onClick={() => setOpen(false)}>
                  <span className={`notif-ic tone-${n.tone}`} aria-hidden>{KIND_ICON[n.kind] ?? <Info size={16} />}</span>
                  <span className="notif-body">
                    <span className="notif-title">{n.title}</span>
                    <span className="notif-text">{n.text}</span>
                  </span>
                  {fresh.has(n.id) && <span className="notif-new"><span className="sr-only">новое</span></span>}
                </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
