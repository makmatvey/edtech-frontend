import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Backpack, Eye, EyeOff, LogIn, Presentation, RotateCw } from "lucide-react";
import { useAuth, type Role } from "../lib/auth";
import { ApiError } from "../lib/api";
import { AppSplash, Brand, Seg } from "../components/ui";
import { RegisterForm } from "./Register";
import { useTitle } from "../lib/hooks";

const SOURCES = [
  { name: "Учебные программы и методика", src: "profil.adu.by" },
  { name: "Учебники", src: "e-padruchnik" },
  { name: "Видеоуроки", src: "ЕИОР" },
  { name: "Аудио для языков", src: "Lingvo" },
];

const ROLES: { role: Role; title: string; text: string; icon: JSX.Element }[] = [
  { role: "student", title: "Я ученик", text: "Оценки, расписание, ДЗ и квиз дня", icon: <Backpack size={20} /> },
  { role: "teacher", title: "Я учитель", text: "Журнал, темы уроков, аналитика класса", icon: <Presentation size={20} /> },
];

export function LoginPage() {
  useTitle("Вход");
  const { user, ready, login, resuming, retryResume } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const from = (loc.state as { from?: string } | null)?.from;
  const [role, setRole] = useState<Role>("student");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  if (!ready) return <AppSplash />;
  if (user) {
    // Сохранённый вход открылся (в т.ч. сам — после возврата сети): ведём туда, куда человек шёл
    const base = user.role === "teacher" ? "/t" : "/s";
    const back = from && (from === base || from.startsWith(`${base}/`) || from.startsWith(`${base}?`)) ? from : base;
    return <Navigate to={back} replace />;
  }

  async function submit(e?: FormEvent, override?: { login: string; role: Role }) {
    e?.preventDefault();
    const l = override?.login ?? loginName.trim();
    const p = override ? "demo" : password;
    const r = override?.role ?? role;
    if (!l || !p) { setError("Введите логин и пароль"); return; }
    setBusy(true);
    setError(null);
    try {
      const u = await login(l, p, r);
      nav(u.role === "teacher" ? "/t" : "/s", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось войти");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <section className="login-art grid-paper" aria-label="О платформе">
        <div className="margin-line" aria-hidden />
        <Brand />
        <h1>Журнал, программа и&nbsp;учебники в&nbsp;одном окне</h1>
        <p className="lead">
          Класна объединяет государственные образовательные ресурсы Беларуси. У каждого урока уже есть
          тема по программе, параграф учебника и тренажёр, а ученики закрепляют материал за пять минут в день.
        </p>
        <div className="sources" aria-label="Подключённые источники">
          {SOURCES.map((s) => (
            <span key={s.src} className="chip" title={s.src}>
              <span className="strong" style={{ color: "var(--ink)" }}>{s.name}</span>
              <span className="muted">{s.src}</span>
            </span>
          ))}
        </div>
        <div className="login-note">
          <div><b>6 → 1</b><span>сервисов и логинов</span></div>
          <div><b>1 клик</b><span>журнал урока</span></div>
          <div><b>5 минут</b><span>квиз дня для ученика</span></div>
        </div>
      </section>

      <section className="login-form">
        <div className="login-card">
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <h2 style={{ fontSize: 26, letterSpacing: "-0.02em" }}>{mode === "login" ? "Вход" : "Регистрация"}</h2>
            <Seg label="Вход или регистрация" value={mode} onChange={(m) => { setMode(m); setError(null); }} options={[{ value: "login", label: "Вход" }, { value: "register", label: "Регистрация" }]} />
          </div>
          <p className="muted" style={{ marginTop: -8 }}>Выберите, кто вы, — у ученика и учителя разные кабинеты.</p>
          {!online ? (
            <div className="callout warn small" role="status">
              {resuming
                ? "Нет связи с интернетом. Сохранённый вход откроется автоматически, как только соединение восстановится."
                : "Нет связи с интернетом. Войти можно, когда соединение восстановится."}
            </div>
          ) : resuming && (
            <div className="callout warn small row" role="status" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <span>Сервер пока не отвечает. Сохранённый вход откроется автоматически — проверяем каждые 15 секунд.</span>
              <button type="button" className="btn btn-sm" onClick={retryResume}><RotateCw size={14} /> Проверить сейчас</button>
            </div>
          )}

          <div className="role-cards" role="radiogroup" aria-label="Роль">
            {ROLES.map((r) => (
              <button
                key={r.role}
                type="button"
                role="radio"
                aria-checked={role === r.role}
                className="role-card"
                onClick={() => { setRole(r.role); setError(null); }}
              >
                <span className="ic">{r.icon}</span>
                <b>{r.title}</b>
                <span>{r.text}</span>
              </button>
            ))}
          </div>

          {mode === "register" ? <RegisterForm key={role} role={role} /> : (
          <form className="stack" style={{ gap: 18 }} onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="login">Логин</label>
            <input id="login" className="input" autoComplete="username" value={loginName} onChange={(e) => setLoginName(e.target.value)} placeholder={role === "teacher" ? "например, teacher" : "например, student"} />
          </div>
          <div className="field">
            <label htmlFor="password">Пароль</label>
            <div style={{ position: "relative" }}>
              <input id="password" className="input" style={{ width: "100%", paddingRight: 44 }} type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" className="btn btn-ghost btn-sm btn-icon" style={{ position: "absolute", right: 4, top: 4 }} onClick={() => setShow((s) => !s)} aria-label={show ? "Скрыть пароль" : "Показать пароль"}>
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && <div className="error-box small" role="alert">{error}</div>}

          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
            <LogIn size={18} /> {busy ? "Входим…" : role === "teacher" ? "Войти как учитель" : "Войти как ученик"}
          </button>
          <p className="small muted" style={{ textAlign: "center" }}>
            Нет аккаунта? <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--blue)", height: 26 }} onClick={() => setMode("register")}>Зарегистрироваться</button>
          </p>
          </form>
          )}

          <div className="demo-box">
            <span className="small muted">Демо-доступ для жюри (пароль <b>demo</b>):</span>
            <div className="row wrap">
              <button type="button" className="btn btn-sm" disabled={busy} onClick={() => submit(undefined, { login: "student", role: "student" })}>
                <Backpack size={14} /> Ученица 7Б
              </button>
              <button type="button" className="btn btn-sm" disabled={busy} onClick={() => submit(undefined, { login: "student11", role: "student" })}>
                <Backpack size={14} /> Ученик 11А (ЦТ/ЦЭ)
              </button>
              <button type="button" className="btn btn-sm" disabled={busy} onClick={() => submit(undefined, { login: "teacher", role: "teacher" })}>
                <Presentation size={14} /> Учитель математики
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
