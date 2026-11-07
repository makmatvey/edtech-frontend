import { useCallback, useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  BookOpen, CalendarDays, Clapperboard, FileText, Flame, GraduationCap, Headphones, Home, LineChart, ListChecks, NotebookPen, Puzzle, Search, Sparkles, Target, UserRound, Users, X,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { Brand } from "./ui";
import { ProfileMenu } from "./ProfileMenu";
import { fmtDayShort, fmtLong, weekdayShort } from "../lib/format";
import { NotificationBell } from "./Notifications";
import { CommandPalette, isMac } from "./CommandPalette";
import { StreakPill } from "./StreakPill";

type Item = { to: string; label: string; short: string; icon: ReactNode; end?: boolean; mobile?: boolean; keywords?: string };

const TEACHER: Item[] = [
  { to: "/t", label: "Сегодня", short: "Сегодня", icon: <Home size={18} />, end: true, mobile: true, keywords: "главная уроки дашборд журнал" },
  { to: "/t/schedule", label: "Расписание на неделю", short: "Неделя", icon: <CalendarDays size={18} />, mobile: true, keywords: "неделя календарь уроки домашнее задание дз" },
  { to: "/t/attendance", label: "Посещаемость", short: "Явка", icon: <Users size={18} />, mobile: true, keywords: "явка пропуски отсутствие н ув excel" },
  { to: "/t/performance", label: "Успеваемость", short: "Оценки", icon: <LineChart size={18} />, mobile: true, keywords: "оценки отметки средний балл четверть excel" },
  { to: "/t/program", label: "Программа (КТП)", short: "КТП", icon: <ListChecks size={18} />, keywords: "ктп календарно-тематическое планирование темы" },
  { to: "/t/activity", label: "Активность класса", short: "Стрики", icon: <Flame size={18} />, mobile: true, keywords: "стрики квизы точность слабые темы" },
  { to: "/t/manuals", label: "Учебники", short: "Учебники", icon: <BookOpen size={18} />, keywords: "учебники книги библиотека обложки pdf e-padruchnik" },
  { to: "/t/video", label: "Видеоуроки", short: "Видео", icon: <Clapperboard size={18} />, keywords: "видео ролики еиор видеоурок" },
  { to: "/t/methods", label: "Методика", short: "Методика", icon: <FileText size={18} />, keywords: "методика profil интерактивные задания курсы советы pdf" },
  { to: "/t/audio", label: "Аудио для языков", short: "Аудио", icon: <Headphones size={18} />, keywords: "аудио лингва lingvo аудирование английский произношение" },
  { to: "/t/tasks", label: "Конструктор заданий", short: "Задания", icon: <Puzzle size={18} />, keywords: "конструктор интерактивные задания тест пары пропуски порядок группы boxapps learningapps доска" },
];
const STUDENT: Item[] = [
  { to: "/s", label: "Главная", short: "Главная", icon: <Home size={18} />, end: true, mobile: true, keywords: "главная сегодня уроки" },
  { to: "/s/streak", label: "Квиз дня и стрик", short: "Стрик", icon: <Flame size={18} />, mobile: true, keywords: "квиз тест огонёк серия" },
  { to: "/s/exam", label: "Подготовка к ЦТ/ЦЭ", short: "ЦТ/ЦЭ", icon: <Target size={18} />, mobile: true, keywords: "цт цэ экзамен тестирование вуз тренировка" },
  { to: "/s/grades", label: "Мои оценки", short: "Оценки", icon: <GraduationCap size={18} />, keywords: "отметки дневник средний балл" },
  { to: "/s/schedule", label: "Дневник", short: "Дневник", icon: <CalendarDays size={18} />, mobile: true, keywords: "расписание неделя уроки календарь дневник" },
  { to: "/s/homework", label: "Домашние задания", short: "ДЗ", icon: <NotebookPen size={18} />, mobile: true, keywords: "дз домашка задание самопроверка" },
  { to: "/s/library", label: "Учебники и материалы", short: "Учебники", icon: <BookOpen size={18} />, keywords: "книги библиотека видео аудио" },
];

/** Пункт бокового меню; tabs — страницы раздела, переключаются вкладками над содержимым */
type Section = { to: string; label: string; short: string; icon: ReactNode; end?: boolean; mobile?: boolean; tabs?: { to: string; label: string }[]; also?: string[] };

const TEACHER_MENU: Section[] = [
  { to: "/t", label: "Сегодня", short: "Сегодня", icon: <Home size={18} />, end: true, mobile: true },
  { to: "/t/schedule", label: "Расписание", short: "Неделя", icon: <CalendarDays size={18} />, mobile: true, also: ["/t/lesson"],
    tabs: [{ to: "/t/schedule", label: "Неделя" }, { to: "/t/program", label: "Программа (КТП)" }] },
  { to: "/t/performance", label: "Класс", short: "Класс", icon: <Users size={18} />, mobile: true, also: ["/t/student"],
    tabs: [{ to: "/t/performance", label: "Успеваемость" }, { to: "/t/attendance", label: "Посещаемость" }, { to: "/t/activity", label: "Активность" }] },
  { to: "/t/manuals", label: "Материалы", short: "Материалы", icon: <BookOpen size={18} />, mobile: true,
    tabs: [{ to: "/t/manuals", label: "Учебники" }, { to: "/t/video", label: "Видео" }, { to: "/t/audio", label: "Аудио" }, { to: "/t/methods", label: "Методика" }] },
  { to: "/t/tasks", label: "Конструктор заданий", short: "Задания", icon: <Puzzle size={18} />, mobile: true },
];
const STUDENT_MENU: Section[] = STUDENT;

const under = (path: string, to: string) => path === to || path.startsWith(`${to}/`);
const sectionActive = (s: Section, path: string) =>
  s.end ? path === s.to : [s.to, ...(s.tabs ?? []).map((t) => t.to), ...(s.also ?? [])].some((p) => under(path, p));


/** Подсказка ученику в сайдбаре; крестиком скрывается навсегда (запоминается в браузере) */
function SidebarHint({ userId }: { userId: number }) {
  const storageKey = `klasna:sidebar-hint-dismissed:${userId}:student`;
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(storageKey) === "1"; } catch { return false; }
  });
  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(storageKey, "1"); } catch { /* Закрытие работает и без хранилища. */ }
  };
  if (dismissed) return null;
  return (
    <div className="callout info small sidebar-hint">
      <Sparkles size={16} style={{ flex: "none", marginTop: 2 }} />
      <span>Перевёрнутые уроки отмечены в ДЗ и дневнике. Стрик растёт за квиз дня или самопроверку ДЗ.</span>
      <button type="button" className="sidebar-hint-close" onClick={dismiss} aria-label="Скрыть подсказку" title="Скрыть подсказку">
        <X size={14} />
      </button>
    </div>
  );
}

export function Layout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Быстрый переход: Ctrl/⌘+K везде, «/» — когда фокус не в поле ввода
  const [palette, setPalette] = useState(false);
  const closePalette = useCallback(() => setPalette(false), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.code === "KeyK" || e.key.toLowerCase() === "k")) {
        e.preventDefault();
        setPalette((v) => !v);
        return;
      }
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const t = e.target as HTMLElement | null;
        const typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
        if (typing || document.querySelector("[aria-modal='true']")) return;
        e.preventDefault();
        setPalette(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (!user) return null;
  // Подготовка к ЦТ/ЦЭ — только 10–11 классы
  const forStudent = <T extends { to: string }>(xs: T[]) => xs.filter((x) => x.to !== "/s/exam" || (user.grade ?? 0) >= 10);
  const items = user.role === "teacher" ? TEACHER : forStudent(STUDENT); // все страницы — для быстрого перехода Ctrl+K
  const menu = user.role === "teacher" ? TEACHER_MENU : forStudent(STUDENT_MENU);
  const current = menu.find((m) => m.tabs && sectionActive(m, pathname) && m.tabs.some((t) => under(pathname, t.to)));
  return (
    <div className="shell">
      <a href="#main" className="skip-link">Перейти к содержимому</a>
      <aside className="sidebar" aria-label="Основное меню">
        <NavLink to={items[0].to} className="brand"><Brand /></NavLink>
        <nav className="nav">
          {menu.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end} className={() => (sectionActive(i, pathname) ? "active" : "")}>
              {i.icon}
              {i.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          {user.role === "student" && <SidebarHint key={user.id} userId={user.id} />}
          <ProfileMenu />
        </div>
      </aside>

      <div className="main">
        <header className={`topbar ${scrolled ? "scrolled" : ""}`}>
          <span className="mobile-brand"><Brand compact /></span>
          <span className="topbar-title">
            <b className="hide-sm">{fmtLong(user.today)}</b>
            <b className="show-sm">{weekdayShort(user.today)}, {fmtDayShort(user.today)}</b>
            <span className="hide-sm"> · {user.school}</span>
          </span>
          <div className="topbar-actions">
            {user.role === "student" && <StreakPill />}
            <button type="button" className="search-trigger" onClick={() => setPalette(true)}
              aria-label={`Быстрый переход (${isMac() ? "⌘" : "Ctrl"}+K)`} aria-haspopup="dialog" aria-keyshortcuts={isMac() ? "Meta+K" : "Control+K"}>
              <Search size={16} />
              <span className="search-trigger-text">{user.role === "teacher" ? "Ученик, тема, раздел" : "Перейти к разделу"}</span>
              <span className="search-trigger-kbd"><kbd className="kbd">{isMac() ? "⌘" : "Ctrl"}</kbd><kbd className="kbd">K</kbd></span>
            </button>
            <NotificationBell role={user.role} userId={user.id} />
            <span className="mobile-brand"><ProfileMenu compact /></span>
          </div>
        </header>
        <main className="content" id="main">
          {current?.tabs && (
            <nav className="subnav" aria-label={current.label}>
              {current.tabs.map((t) => (
                <NavLink key={t.to} to={t.to} className={({ isActive }) => (isActive ? "active" : "")}>{t.label}</NavLink>
              ))}
            </nav>
          )}
          <Outlet />
        </main>
      </div>

      {palette && <CommandPalette role={user.role} nav={[...items, { to: `/${user.role === "teacher" ? "t" : "s"}/profile`, label: user.role === "student" ? "Профиль и достижения" : "Профиль и настройки", icon: <UserRound size={18} />, keywords: "профиль аватар фото настройки тема пароль значки рамка достижения" }]} onClose={closePalette} />}

      <nav className="tabbar" aria-label="Меню">
        {menu.filter((i) => i.mobile).map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end} className={() => (sectionActive(i, pathname) ? "active" : "")}>
            {i.icon}
            {i.short}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

