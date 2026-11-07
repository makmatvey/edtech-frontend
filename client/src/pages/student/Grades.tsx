import { useState } from "react";
import { useApi, useTitle } from "../../lib/hooks";
import { Empty, Load, Mark, PageHead, Panel, Seg } from "../../components/ui";
import { Sparkline } from "../../components/charts";
import { GRADE_KIND, fmtAvg, fmtDayShort, gradeTone } from "../../lib/format";

type Data = {
  quarter: number; quarters: number[]; from: string; to: string; average: number | null;
  subjects: { id: number; name: string; color: string; teacher: string; average: number | null; quarterAverages: { no: number; average: number | null }[]; classAverage: number | null; missed: number; grades: { value: number; kind: string; date: string; topic: string | null }[] }[];
};

export default function StudentGrades() {
  useTitle("Мои оценки");
  const [quarter, setQuarter] = useState<number>(0);
  const state = useApi<Data>(`/student/grades?quarter=${quarter}`);

  return (
    <>
      <PageHead
        title="Мои оценки"
        sub={state.data ? <>Средний балл {state.data.quarter ? `за ${state.data.quarter}-ю четверть` : "за год"}: <b className="num">{fmtAvg(state.data.average, 2)}</b> · 10-балльная система</> : " "}
        actions={state.data && (
          <Seg label="Период" value={state.data.quarter} onChange={setQuarter} options={[{ value: 0, label: "Весь год" }, ...state.data.quarters.map((q) => ({ value: q, label: `${q} четверть` }))]} />
        )}
      />
      <Load state={state}>
        {(d) => (
          <div className="stack">
            <div className="row wrap small muted" style={{ gap: 18 }}>
              <span className="row"><Mark value={8} size="sm" /> ответ на уроке</span>
              <span className="row"><Mark value={8} kind="independent" size="sm" /> самостоятельная</span>
              <span className="row"><Mark value={8} kind="control" size="sm" /> контрольная</span>
            </div>
            <Panel>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Предмет</th><th>Оценки</th><th className="center hide-sm">Динамика</th>{d.quarter === 0 && d.quarters.map((q) => <th key={q} className="right hide-sm">{q} четв.</th>)}<th className="right">Средний</th><th className="right hide-sm">Класс</th><th className="right hide-sm">Пропуски</th></tr>
                  </thead>
                  <tbody>
                    {d.subjects.map((s) => (
                      <tr key={s.id}>
                        <td style={{ minWidth: 170 }}>
                          <div className="row" style={{ gap: 10 }}>
                            <span style={{ width: 4, height: 30, borderRadius: 2, background: s.color, flex: "none" }} />
                            <div><div className="strong small">{s.name}</div><div className="tiny muted">{s.teacher}</div></div>
                          </div>
                        </td>
                        <td>
                          {s.grades.length === 0 ? <span className="small muted">пока нет оценок</span> : (
                            <div className="marks" style={{ minWidth: 200 }}>
                              {s.grades.map((g, i) => <Mark key={i} value={g.value} kind={g.kind} title={`${fmtDayShort(g.date)} · ${GRADE_KIND[g.kind]}${g.topic ? ` · ${g.topic}` : ""}`} />)}
                            </div>
                          )}
                        </td>
                        <td className="center hide-sm"><div style={{ display: "inline-block" }}><Sparkline values={s.grades.map((g) => g.value)} /></div></td>
                        {d.quarter === 0 && s.quarterAverages.map((qa) => <td key={qa.no} className="right num hide-sm">{fmtAvg(qa.average)}</td>)}
                        <td className="right"><span className={`metric-value ${gradeTone(s.average)}`} style={{ fontSize: 20 }}>{fmtAvg(s.average)}</span></td>
                        <td className="right num muted hide-sm">{fmtAvg(s.classAverage)}</td>
                        <td className="right num hide-sm">{s.missed || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {d.subjects.every((s) => s.grades.length === 0) && <Empty title="Оценок за этот период пока нет" />}
            </Panel>
            <p className="tiny muted">«Класс» — средний балл класса по предмету: помогает понять, насколько тема далась всем. Наведите на оценку, чтобы увидеть дату и тему урока.</p>
          </div>
        )}
      </Load>
    </>
  );
}
