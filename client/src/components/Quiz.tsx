import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, Check, Flame as FlameIcon, RotateCcw, Snowflake, X } from "lucide-react";
import { Flame } from "./Flame";
import { setStreak } from "../lib/streak";
import { api, ApiError } from "../lib/api";
import { ErrorBox, SubjectTag } from "./ui";
import { days } from "../lib/format";

type Q = { id: number; question: string; kind?: "choice" | "short"; options: string[]; subject: string; subjectCode: string; color: string };
type Start = { attemptId: number; mode: "daily" | "homework" | "flipped" | "exam"; questions: Q[] };
type Result = {
  score: number; total: number; passed: boolean; xp: number; dayCounted: boolean;
  review: { id: number; chosen: number | string; correct: number; correctText: string | null; isCorrect: boolean; explanation: string }[];
  streak: { current: number; best: number; todayDone: boolean; atRisk: boolean };
};

const KEYS = ["А", "Б", "В", "Г", "Д"];

/** Прохождение квиза: вопросы по одному, проверка — на сервере, затем разбор ошибок. */
export function Quiz({ startPath, startBody, title, onFinished, onClose }: {
  startPath: string; startBody?: Record<string, unknown>; title: string; onFinished?: (r: Result) => void; onClose: () => void;
}) {
  const [data, setData] = useState<Start | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<(number | string | null)[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [sending, setSending] = useState(false);

  const start = async () => {
    setError(null);
    setData(null);
    setResult(null);
    setI(0);
    try {
      const r = await api<Start>(startPath, { method: "POST", body: startBody });
      setData(r);
      setAnswers(r.questions.map(() => null));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось загрузить вопросы");
    }
  };
  useEffect(() => { start(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [startPath, JSON.stringify(startBody ?? null)]);

  const q = data?.questions[i];
  const chosen = answers[i];
  const isShort = q?.kind === "short";
  const answered = isShort ? typeof chosen === "string" && chosen.trim() !== "" : chosen != null;
  const last = data ? i === data.questions.length - 1 : false;

  async function submit() {
    if (!data) return;
    setSending(true);
    try {
      const r = await api<Result>(`/student/quiz/${data.attemptId}/submit`, { method: "POST", body: { answers: answers.map((a) => (typeof a === "string" ? a.trim() : a)) } });
      setResult(r);
      if (r.streak) setStreak(r.streak as any);
      onFinished?.(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось отправить ответы");
    } finally {
      setSending(false);
    }
  }

  function next() {
    if (!answered || sending) return;
    if (last) submit();
    else setI(i + 1);
  }

  // Горячие клавиши: 1–4 — выбрать вариант, Enter — дальше/проверить.
  // Обработчик с актуальным состоянием лежит в ref, а подписка на window — одна на всё прохождение.
  const onKeyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  onKeyRef.current = (e: KeyboardEvent) => {
    if (!q || e.ctrlKey || e.altKey || e.metaKey) return;
    const t = e.target as HTMLElement | null;
    const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
    const n = /^[1-9]$/.test(e.key) ? Number(e.key) : 0;
    // цифры, набранные в поле ответа (часть В), — это текст ответа, а не выбор варианта
    if (!isShort && !typing && n >= 1 && n <= q.options.length) {
      setAnswers((a) => a.map((x, k) => (k === i ? n - 1 : x)));
      return;
    }
    if (e.key === "Enter" && !e.repeat && answered) { e.preventDefault(); next(); }
  };
  const hotkeys = !!q && !result;
  useEffect(() => {
    if (!hotkeys) return;
    const onKey = (e: KeyboardEvent) => onKeyRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hotkeys]);

  if (error) return <div className="quiz stack"><ErrorBox message={error} onRetry={start} /><button className="btn" onClick={onClose}>Закрыть</button></div>;
  if (!data || !q) return <div className="quiz"><div className="skeleton" style={{ height: 320 }} /></div>;

  if (result) {
    return (
      <div className="quiz">
        <div style={{ textAlign: "center", padding: "8px 0 20px" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
            <ResultFlame lit={result.streak.todayDone} ignite={result.dayCounted} />
          </div>
          <div className="result-score" style={{ color: result.passed ? "var(--green)" : "var(--red)" }}>{result.score} / {result.total}</div>
          <h2 style={{ fontSize: 22, marginTop: 4 }}>
            {result.passed
              ? data.mode === "flipped" ? "Готовы к обсуждению!"
                : data.mode === "exam" ? "Вариант сдан"
                  : result.dayCounted ? "День засчитан!" : "Отлично, верно!"
              : "Почти получилось"}
          </h2>
          <p className="ink-2" style={{ marginTop: 6 }}>
            {result.passed
              ? data.mode === "flipped"
                ? "Тема отмечена как подготовленная. На уроке можно смело включаться в обсуждение."
                : data.mode === "exam"
                  ? <>Точность: <b>{Math.round((result.score / result.total) * 100)} %</b>. Стрик за тренировку к ЦТ/ЦЭ не начисляется — это отдельная подготовка.</>
                  : result.dayCounted
                    ? <>Стрик: <b>{days(result.streak.current)}</b> подряд · +{result.xp} XP</>
                    : result.xp ? <>+{result.xp} XP — день уже был засчитан раньше</> : "Тренировка пройдена — день уже засчитан"
              : data.mode === "flipped" || data.mode === "exam"
                ? <>Нужно хотя бы {Math.ceil(result.total * 0.6)} верных из {result.total}. Разберите ошибки и попробуйте ещё раз.</>
                : <>Нужно хотя бы {Math.ceil(result.total * 0.6)} верных ответа из {result.total}, чтобы день засчитался. Разберите ошибки и попробуйте ещё раз.</>}
          </p>
        </div>
        <div className="stack" style={{ gap: 10 }}>
          {data.questions.map((qq, k) => {
            const r = result.review[k];
            return (
              <div key={qq.id} className="panel panel-pad" style={{ padding: 16 }}>
                <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
                  <span style={{ flex: "none", width: 24, height: 24, borderRadius: 12, display: "grid", placeItems: "center", background: r.isCorrect ? "var(--green-soft)" : "var(--red-soft)", color: r.isCorrect ? "var(--green)" : "var(--red)" }}>
                    {r.isCorrect ? <Check size={14} /> : <X size={14} />}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="tiny muted">{qq.subject}</div>
                    <div className="strong small">{qq.question}</div>
                    <div className="small" style={{ marginTop: 4 }}>
                      {!r.isCorrect && <span style={{ color: "var(--red)", textDecoration: "line-through", marginRight: 8 }}>{typeof r.chosen === "string" ? r.chosen : qq.options[r.chosen]}</span>}
                      <span style={{ color: "var(--green)", fontWeight: 600 }}>{r.correctText ?? qq.options[r.correct]}</span>
                    </div>
                    {!r.isCorrect && r.explanation && <div className="tiny ink-2" style={{ marginTop: 4 }}>{r.explanation}</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="row" style={{ marginTop: 20, justifyContent: "center" }}>
          {!result.passed && (data.mode === "daily" || data.mode === "exam") && (
            <button className="btn btn-primary" onClick={start}><RotateCcw size={16} /> {data.mode === "exam" ? "Новый вариант" : "Новый квиз"}</button>
          )}
          <button className={`btn ${result.passed ? "btn-primary" : ""}`} onClick={onClose}>Готово</button>
        </div>
      </div>
    );
  }

  return (
    <div className="quiz">
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="strong">{title}</span>
        <span className="muted small" style={{ marginLeft: "auto" }}>Вопрос {i + 1} из {data.questions.length}</span>
      </div>
      <div className="quiz-progress" aria-hidden>{data.questions.map((_, k) => <i key={k} className={k <= i ? "on" : ""} />)}</div>
      <div className="row" style={{ gap: 8 }}>
        <SubjectTag name={q.subject} color={q.color} />
        {data.mode === "exam" && <span className={`chip ${isShort ? "chip-blue" : ""}`}>{isShort ? "Часть В · краткий ответ" : "Часть А · выбор ответа"}</span>}
      </div>
      <div className="quiz-q" id={`q-${q.id}`}>{q.question}</div>
      {isShort ? (
        <div className="quiz-short">
          <label htmlFor={`a-${q.id}`} className="small ink-2">Ваш ответ — число или слово</label>
          <input id={`a-${q.id}`} key={q.id} className="input quiz-input" autoFocus autoComplete="off" spellCheck={false} maxLength={100}
            value={typeof chosen === "string" ? chosen : ""} placeholder="Введите ответ"
            onChange={(e) => { const v = e.target.value; setAnswers((a) => a.map((x, j) => (j === i ? v : x))); }} />
        </div>
      ) : (
        <div className="options" role="radiogroup" aria-labelledby={`q-${q.id}`}>
          {q.options.map((o, k) => (
            <button key={k} type="button" className="option" role="radio" aria-checked={chosen === k}
              onClick={() => setAnswers((a) => a.map((x, j) => (j === i ? k : x)))}
              style={{ "--c": q.color } as CSSProperties}>
              <span className="k">{KEYS[k]}</span>
              <span>{o}</span>
            </button>
          ))}
        </div>
      )}
      <div className="row" style={{ marginTop: 20 }}>
        <span className="tiny muted hide-sm">{isShort ? <>Регистр и пробелы не важны · <span className="kbd">Enter</span> — дальше</> : <>Подсказка: клавиши <span className="kbd">1</span>–<span className="kbd">4</span> и <span className="kbd">Enter</span></>}</span>
        <div className="row" style={{ marginLeft: "auto" }}>
          {i > 0 && <button className="btn" onClick={() => setI(i - 1)}>Назад</button>}
          <button className="btn btn-primary" disabled={!answered || sending} onClick={next}>
            {last ? (sending ? "Проверяем…" : "Проверить") : "Дальше"} <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** В результате квиза огонёк загорается на глазах, если день только что засчитан. */
function ResultFlame({ lit, ignite }: { lit: boolean; ignite: boolean }) {
  const [on, setOn] = useState(lit && !ignite);
  useEffect(() => {
    if (!ignite) { setOn(lit); return; }
    const t = setTimeout(() => setOn(true), 250);
    return () => clearTimeout(t);
  }, [lit, ignite]);
  return <Flame lit={on} size={ignite ? 96 : 64} />;
}

export function StreakRules() {
  return (
    <ul className="small ink-2" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
      <li><b>Квиз дня</b> — 5 вопросов по темам, которые ваш класс уже прошёл. 3 верных ответа и больше — день засчитан.</li>
      <li><b>Самопроверка ДЗ</b> — 3 вопроса по теме урока. Тоже засчитывает день.</li>
      <li>Просто зайти на сайт — не считается. Повторное прохождение в тот же день второй день не даёт.</li>
      <li>Выходные и каникулы стрик не обрывают. <Snowflake size={12} style={{ verticalAlign: -1 }} /> Одна «заморозка» в неделю спасает пропущенный учебный день.</li>
      <li><FlameIcon size={12} style={{ verticalAlign: -1 }} /> Значки за 3, 7, 14 и 30 дней подряд.</li>
    </ul>
  );
}
