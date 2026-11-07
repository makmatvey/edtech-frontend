import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Eye, EyeOff, RotateCw, UserPlus } from "lucide-react";
import { PASSWORD_HINT, passwordProblem, useAuth, type Role } from "../lib/auth";
import { ApiError } from "../lib/api";
import { useApi } from "../lib/hooks";

type Options = { grades: { grade: number; subjects: { code: string; name: string; color: string }[] }[]; demoSchoolCode: string | null };

/** Подсказка к новому паролю: правило и галочки по мере ввода */
function PasswordRules({ id, value }: { id: string; value: string }) {
  const rules = [
    { ok: value.length >= 8, text: "8+ символов" },
    { ok: /\p{L}/u.test(value), text: "буква" },
    { ok: /\d/.test(value), text: "цифра" },
  ];
  return (
    <div className="pw-rules tiny" id={id}>
      <span className="muted">{PASSWORD_HINT}.</span>
      <span className="pw-rules-list" aria-hidden>
        {rules.map((r) => <span key={r.text} className={r.ok ? "ok" : ""}><Check size={12} /> {r.text}</span>)}
      </span>
    </div>
  );
}

/** Регистрация: ученик — по коду класса, учитель — по коду школы с созданием своего класса */
export function RegisterForm({ role }: { role: Role }) {
  const { register } = useAuth();
  const nav = useNavigate();
  const opts = useApi<Options>(role === "teacher" ? "/auth/register/options" : null);
  const [fullName, setFullName] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [classCode, setClassCode] = useState("");
  const [schoolCode, setSchoolCode] = useState("");
  const [grade, setGrade] = useState<number | null>(null);
  const [letter, setLetter] = useState("");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const g = grade ?? opts.data?.grades[0]?.grade ?? null;
  const gradeSubjects = opts.data?.grades.find((x) => x.grade === g)?.subjects ?? [];

  function validate(): string | null {
    if (fullName.trim().split(/\s+/).length < 2) return "Укажите фамилию и имя";
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(login.trim())) return "Логин — от 3 символов: латинские буквы, цифры, точка, дефис";
    const pw = passwordProblem(password);
    if (pw) return pw;
    if (role === "student" && classCode.trim().length < 4) return "Введите код класса — его даёт классный руководитель";
    if (role === "teacher") {
      if (!opts.data) return opts.error ? "Не удалось загрузить список классов — нажмите «Повторить»" : "Подождите, загружаем список классов…";
      if (!schoolCode.trim()) return "Введите код школы";
      if (!/^[А-ЯЁа-яё]$/.test(letter.trim())) return "Буква класса — одна русская буква";
      if (!subjects.length) return "Отметьте предметы, которые будете вести";
    }
    return null;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const v = validate();
    if (v) { setError(v); return; }
    setBusy(true);
    setError(null);
    try {
      const body = role === "student"
        ? { role, fullName, login: login.trim(), password, classCode }
        : { role, fullName, login: login.trim(), password, schoolCode, grade: g, letter, subjects };
      const u = await register(body);
      nav(u.role === "teacher" ? "/t?welcome=1" : "/s?welcome=1", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось зарегистрироваться");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" style={{ gap: 14 }} onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="r-name">Фамилия, имя{role === "teacher" ? ", отчество" : ""}</label>
        <input id="r-name" className="input" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={role === "teacher" ? "Иванова Мария Сергеевна" : "Петров Иван"} />
      </div>

      {role === "student" ? (
        <div className="field">
          <label htmlFor="r-code">Код класса</label>
          <input id="r-code" className="input" style={{ textTransform: "uppercase", letterSpacing: 1 }} value={classCode} onChange={(e) => setClassCode(e.target.value)} placeholder="например, 7B-K4P2" />
          <span className="tiny muted">Код выдаёт классный руководитель — он виден в его кабинете.</span>
        </div>
      ) : (
        <>
          <div className="field">
            <label htmlFor="r-school">Код школы</label>
            <input id="r-school" className="input" style={{ textTransform: "uppercase" }} value={schoolCode} onChange={(e) => setSchoolCode(e.target.value)} placeholder="выдаёт администрация" />
            {opts.data?.demoSchoolCode && <span className="tiny muted">Для демо: <button type="button" className="btn btn-ghost btn-sm" style={{ height: 22, padding: "0 6px" }} onClick={() => setSchoolCode(opts.data!.demoSchoolCode!)}>{opts.data.demoSchoolCode}</button></span>}
          </div>
          <div className="row" style={{ gap: 12, alignItems: "flex-end" }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="r-grade">Ваш класс</label>
              {opts.data ? (
                <select id="r-grade" className="select" value={g ?? ""} onChange={(e) => { setGrade(Number(e.target.value)); setSubjects([]); }}>
                  {opts.data.grades.map((x) => <option key={x.grade} value={x.grade}>{x.grade} класс</option>)}
                </select>
              ) : (
                <select id="r-grade" className="select" disabled value="" aria-busy={!opts.error} aria-invalid={!!opts.error} aria-describedby={opts.error ? "r-grade-err" : undefined}>
                  <option value="">{opts.error ? "Не загрузилось" : "Загрузка…"}</option>
                </select>
              )}
            </div>
            <div className="field" style={{ width: 110 }}>
              <label htmlFor="r-letter">Буква</label>
              <input id="r-letter" className="input" maxLength={1} style={{ textTransform: "uppercase", textAlign: "center" }} value={letter} onChange={(e) => setLetter(e.target.value)} placeholder="В" />
            </div>
          </div>
          {opts.error && !opts.data && (
            <div className="error-box small row" id="r-grade-err" role="alert" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <span>Не удалось загрузить классы и предметы. {opts.error}</span>
              <button type="button" className="btn btn-sm" onClick={opts.reload}><RotateCw size={14} /> Повторить</button>
            </div>
          )}
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-2)", marginBottom: 6 }}>Предметы, которые вы ведёте в этом классе</legend>
            <div className="row wrap" style={{ gap: 8 }} aria-busy={opts.loading && !opts.data}>
              {!opts.data && !opts.error && [96, 120, 84, 108].map((w, i) => <span key={i} className="skeleton reg-chip-skel" style={{ width: w }} aria-hidden />)}
              {gradeSubjects.map((s) => {
                const on = subjects.includes(s.code);
                return (
                  <button key={s.code} type="button" className={`chip ${on ? "chip-blue" : ""}`} style={{ height: 32, cursor: "pointer", fontSize: 13 }} aria-pressed={on}
                    onClick={() => setSubjects((x) => (on ? x.filter((c) => c !== s.code) : [...x, s.code]))}>
                    {on ? <Check size={13} /> : <span className="dot" style={{ background: s.color }} />} {s.name}
                  </button>
                );
              })}
            </div>
            <span className="tiny muted">Расписание и темы уроков по программе составятся автоматически.</span>
          </fieldset>
        </>
      )}

      <div className="row" style={{ gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="r-login">Логин</label>
          <input id="r-login" className="input" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="латиницей" />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="r-pass">Пароль</label>
          <div style={{ position: "relative" }}>
            <input id="r-pass" className="input" style={{ width: "100%", paddingRight: 40 }} type={show ? "text" : "password"} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="от 8 символов" aria-describedby="r-pass-hint" />
            <button type="button" className="btn btn-ghost btn-sm btn-icon" style={{ position: "absolute", right: 4, top: 4 }} onClick={() => setShow((x) => !x)} aria-label={show ? "Скрыть пароль" : "Показать пароль"}>
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
      </div>
      <PasswordRules id="r-pass-hint" value={password} />

      {error && <div className="error-box small" role="alert">{error}</div>}
      <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
        <UserPlus size={18} /> {busy ? "Создаём кабинет…" : role === "teacher" ? "Зарегистрироваться и создать класс" : "Зарегистрироваться"}
      </button>
    </form>
  );
}
