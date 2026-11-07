import { useState, type CSSProperties } from "react";
import { ArrowRight, Clapperboard, FileText, Target } from "lucide-react";
import { useApi, useTitle } from "../../lib/hooks";
import { Empty, Load, Modal, Metric, PageHead, Panel } from "../../components/ui";
import { Quiz } from "../../components/Quiz";
import { useViewer } from "../../components/Viewer";
import { fmtDayShort, fmtPct, plural } from "../../lib/format";
import type { FileKind } from "../../lib/materials";

type Mat = { id: string; section: string; kind: FileKind; title: string; url: string };
type Variant = { id: string; no: number; title: string };
type VStat = { attempts: number; best: number | null; lastDate: string | null };
type Subject = {
  id: number; code: string; name: string; color: string;
  attempts: number; accuracy: number | null; best: number | null; lastDate: string | null;
  materials: Mat[];
  variantStats: Record<string, VStat>;
};

type Data = {
  grade: number; className: string; stage: string; stageTitle: string; stageHint: string;
  examSize: number; partB: number; totalAttempts: number; variants: Variant[]; subjects: Subject[];
};

export default function StudentExam() {
  useTitle("Подготовка к ЦТ/ЦЭ");
  const state = useApi<Data>("/student/exam");
  const view = useViewer();
  const [active, setActive] = useState<{ subject: Subject; variant: Variant } | null>(null);

  return (
    <>
      <PageHead title="Подготовка к ЦТ/ЦЭ" sub="Тренировочные варианты в формате экзамена: часть А и часть В, по темам вашей программы, с разбором ошибок." />
      <Load state={state}>
        {(d) => {
          const practiced = d.subjects.filter((s) => s.attempts > 0).length;
          const avgAcc = (() => {
            const xs = d.subjects.map((s) => s.accuracy).filter((x): x is number => x != null);
            return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
          })();
          const doneVariants = d.subjects.reduce((n, s) => n + Object.values(s.variantStats).filter((v) => v.attempts > 0).length, 0);
          // «Следующий шаг»: последний предмет, с которым работали, и первый непройденный вариант
          const recent = [...d.subjects].filter((s) => s.lastDate).sort((x, y) => (y.lastDate ?? "").localeCompare(x.lastDate ?? ""))[0];
          const nextVariant = recent && d.variants.find((v) => !(recent.variantStats[v.id]?.attempts));
          return (
            <div className="stack" style={{ gap: 20 }}>
              {recent && nextVariant ? (
                <section className="exam-next" style={{ "--c": recent.color } as CSSProperties} aria-label="Продолжить подготовку">
                  <span className="exam-next-ic" aria-hidden><Target size={22} /></span>
                  <span className="exam-next-txt">
                    <small>Продолжить с того места</small>
                    <b>{recent.name} · {nextVariant.title}</b>
                    <span>Часть А — {d.examSize - d.partB} {plural(d.examSize - d.partB, "задание", "задания", "заданий")} с выбором, часть В — {d.partB} с кратким ответом{recent.best != null ? ` · ваш лучший результат ${recent.best} %` : ""}</span>
                  </span>
                  <button className="btn btn-primary" onClick={() => setActive({ subject: recent, variant: nextVariant })}>
                    Начать вариант <ArrowRight size={16} />
                  </button>
                </section>
              ) : (
                <div className="callout info">
                  <Target size={18} style={{ flex: "none", marginTop: 2 }} />
                  <div>
                    <div className="strong small">{d.stageTitle}</div>
                    <div className="small ink-2" style={{ marginTop: 4 }}>{d.stageHint} Выберите предмет и вариант в таблице ниже.</div>
                  </div>
                </div>
              )}

              {d.totalAttempts > 0 && (
                <div className="grid cols-3 exam-metrics">
                  <Metric label="Тренировок" value={d.totalAttempts} foot={`по ${d.examSize} ${plural(d.examSize, "вопросу", "вопроса", "вопросов")}`} />
                  <Metric label="Вариантов пройдено" value={`${doneVariants} из ${d.subjects.length * d.variants.length}`} foot={`по ${d.variants.length} на предмет`} />
                  <Metric label="Средняя точность" value={fmtPct(avgAcc)} foot={`${practiced} ${plural(practiced, "предмет", "предмета", "предметов")} в работе`} tone={avgAcc != null && avgAcc < 60 ? "warn" : avgAcc != null && avgAcc >= 80 ? "good" : undefined} />
                </div>
              )}

              {d.subjects.length === 0 ? (
                <div className="panel"><Empty title="Нет предметов для тренировки" /></div>
              ) : (
                <Panel className="note" title="Предметы" hint="нажмите на номер варианта, чтобы начать">
                  <ul className="exam-list">
                    {d.subjects.map((s) => {
                      const done = d.variants.filter((v) => (s.variantStats[v.id]?.attempts ?? 0) > 0).length;
                      const firstOpen = d.variants.find((v) => !(s.variantStats[v.id]?.attempts)) ?? d.variants[0];
                      return (
                        <li key={s.id} className="exam-row" style={{ "--c": s.color } as CSSProperties}>
                          <span className="exam-subj">
                            <b><span className="sheet-dot" style={{ background: s.color }} aria-hidden /> {s.name}</b>
                            <small>
                              {done ? <>пройдено {done} из {d.variants.length} · лучший <b className="num">{s.best} %</b>{s.lastDate && <> · {fmtDayShort(s.lastDate)}</>}</> : "ещё не начинали"}
                            </small>
                            <span className="exam-bar" aria-hidden><i style={{ width: `${(done / d.variants.length) * 100}%` }} /></span>
                          </span>
                          <span className="exam-years" role="group" aria-label={`${s.name}: варианты`}>
                            {d.variants.map((v) => {
                              const st = s.variantStats[v.id];
                              const tried = (st?.attempts ?? 0) > 0;
                              return (
                                <button key={v.id} type="button" className={`exam-var-chip ${tried ? "tried" : ""}`}
                                  onClick={() => setActive({ subject: s, variant: v })}
                                  title={tried ? `${v.title}: лучший результат ${st!.best} %` : `${v.title}: ещё не решали`}
                                  aria-label={`${s.name}, ${v.title}${tried ? `, лучший результат ${st!.best} %` : ""}`}>
                                  {v.no}
                                </button>
                              );
                            })}
                          </span>
                          <button type="button" className="btn btn-sm exam-go" onClick={() => setActive({ subject: s, variant: firstOpen })}>
                            {done ? "Дальше" : "Начать"} <ArrowRight size={14} />
                          </button>
                          {s.materials.length > 0 && (
                            <span className="flip-links exam-mats">
                              {s.materials.map((m) => (
                                <button key={m.id} type="button" className="btn btn-sm" onClick={() => view({ title: m.title, url: m.url, kind: m.kind, subtitle: s.name })}>
                                  {m.kind === "video" ? <Clapperboard size={14} /> : <FileText size={14} />} {m.title}
                                </button>
                              ))}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </Panel>
              )}

              <details className="exam-about">
                <summary>Чем отличаются ЦТ и ЦЭ</summary>
                <div className="grid cols-2" style={{ gap: 16 }}>
                  <p className="small ink-2"><b>ЦЭ — централизованный экзамен.</b> Обязательный экзамен по окончании 11 класса. Результаты идут в аттестат и могут учитываться при поступлении.</p>
                  <p className="small ink-2"><b>ЦТ — централизованное тестирование.</b> Вступительные испытания в вузы. Тест состоит из части А (выбор ответа) и части В (краткий ответ).</p>
                </div>
                <p className="tiny muted" style={{ marginTop: 10 }}>Задания составлены по темам вашей программы в формате ЦТ/ЦЭ. Это не задания прошлых лет: их официальные сборники РИКЗ издаются отдельно.</p>
              </details>
            </div>
          );
        }}
      </Load>

      {active && (
        <Modal label={`${active.subject.name} · ${active.variant.title}`} onClose={() => { setActive(null); state.reload(); }}>
          <Quiz
            startPath={`/student/exam/${active.subject.id}`}
            startBody={{ variant: active.variant.id }}
            title={`${active.variant.title} · ${active.subject.name}`}
            onClose={() => { setActive(null); state.reload(); }}
          />
        </Modal>
      )}
    </>
  );
}
