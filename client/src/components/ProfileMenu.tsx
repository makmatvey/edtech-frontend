import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronsUpDown, LogOut, Moon, Sun, UserRound } from "lucide-react";
import { useAuth } from "../lib/auth";
import { loadTheme, saveTheme, type Theme } from "../lib/theme";
import { ACH, Medal, ProfileBg, Showcase, UserAvatar } from "./ProfileBits";
import { useEscapeLayer } from "../lib/layers";

const THEMES: { v: Theme; label: string; icon: JSX.Element }[] = [
  { v: "light", label: "Светлая", icon: <Sun size={14} /> },
  { v: "dark", label: "Тёмная", icon: <Moon size={14} /> },
];

/**
 * Карточка пользователя — кнопка: по нажатию открывается меню профиля
 * (профиль и достижения, тема, выход). compact — круглая аватарка в шапке на телефоне.
 */
export function ProfileMenu({ compact = false }: { compact?: boolean }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Esc — через стек слоёв: закрывает меню, только если поверх него ничего не открыто
  useEscapeLayer(open, () => { setOpen(false); btn.current?.focus(); });
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    box.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!user) return null;
  const base = user.role === "teacher" ? "/t" : "/s";
  const meta = user.role === "teacher" ? (user.className ? `Учитель · кл. рук. ${user.className}` : "Учитель") : `Ученик · ${user.className} класс`;
  const pick = (t: Theme) => { setTheme(t); saveTheme(t); };
  const RANK = { legend: 4, gold: 3, silver: 2, bronze: 1 } as Record<string, number>;
  const top = [...(user.showcase ?? [])].sort((a, b) => (RANK[ACH[b]?.tier] ?? 0) - (RANK[ACH[a]?.tier] ?? 0))[0];

  return (
    <div className={`pm ${compact ? "pm-compact" : ""}`} ref={box}>
      <button ref={btn} type="button" className={compact ? "pm-avatar-btn" : "me me-btn"} aria-haspopup="menu" aria-expanded={open} aria-controls={menuId}
        onClick={() => setOpen((v) => !v)} aria-label={compact ? "Профиль и настройки" : undefined}>
        <span className="pm-ava">
          <UserAvatar name={user.shortName} id={user.id} src={user.avatar} frame={user.frame} size={compact ? 32 : 36} />
          {/* лучший значок с витрины — маленькой медалью на аватарке */}
          {top && <span className="pm-medal"><Medal id={top} size={compact ? 14 : 16} /></span>}
        </span>
        {!compact && (
          <>
            <span style={{ minWidth: 0, flex: 1, textAlign: "left" }}>
              <span className="me-name ellipsis" style={{ display: "block" }}>{user.shortName}</span>
              <span className="me-meta ellipsis" style={{ display: "block" }}>{meta}</span>
            </span>
            <ChevronsUpDown size={15} className="muted" aria-hidden />
          </>
        )}
      </button>
      {open && (
        <div className="pm-menu" role="menu" id={menuId} aria-label="Профиль и настройки">
          <ProfileBg id={user.background} className="pm-banner" />
          <div className="pm-head">
            <UserAvatar name={user.shortName} id={user.id} src={user.avatar} frame={user.frame} size={44} />
            <div style={{ minWidth: 0 }}>
              <div className="strong ellipsis">{user.shortName}</div>
              <div className="tiny muted ellipsis">{meta}</div>
              {(user.showcase?.length ?? 0) > 0 && <div style={{ marginTop: 4 }}><Showcase ids={user.showcase!} size={18} /></div>}
            </div>
          </div>
          <Link to={`${base}/profile`} role="menuitem" className="pm-item" onClick={() => setOpen(false)}>
            <UserRound size={16} /> {user.role === "student" ? "Профиль и достижения" : "Профиль и настройки"}
          </Link>
          <div className="pm-sep" />
          <div className="pm-label">Тема</div>
          <div className="pm-theme" role="group" aria-label="Тема оформления">
            {THEMES.map((t) => (
              <button key={t.v} type="button" role="menuitemradio" aria-checked={theme === t.v} className={theme === t.v ? "on" : ""} onClick={() => pick(t.v)}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
          <div className="pm-sep" />
          <button type="button" role="menuitem" className="pm-item danger" onClick={() => { logout(); nav("/login", { replace: true }); }}>
            <LogOut size={16} /> Выйти
          </button>
        </div>
      )}
    </div>
  );
}
