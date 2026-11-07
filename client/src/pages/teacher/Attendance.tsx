import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarRange, UserX, Users } from "lucide-react";
import { useApi, useTitle } from "../../lib/hooks";
import { useAuth } from "../../lib/auth";
import { useClassPicker } from "../../components/ClassPicker";
import { Empty, Load, Metric, PageHead, Seg } from "../../components/ui";
import { NbHead, NbPage, NbSeg } from "../../components/paper";
import { LineChart } from "../../components/charts";
import { ExportButton } from "../../components/ExportButton";
import { addDays, fmtNum, fmtPct, weekdayShort } from "../../lib/format";

type Cell = { total: number; absent: number; excused: number; late: number } | null;
type Data = {
  from: string; to: string; dates: string[];
  students: { id: number; fullName: string; shortName: string; total: number; absent: number; excused: number; late: number; rate: number | null; atRisk: boolean; days: Cell[] }[];
  summary: { rate: number | null; missedLessons: number; unexcused: number; atRisk: number };
  weekly: { week: string; rate: number }[];
};

const PERIODS = [
  { value: 14, label: "2 недели" },
  { value: 30, label: "Месяц" },
  { value: 999, label: "С 1 сентября" },
];

/** Клетка журнала: как учитель пишет от руки — «н», «ув», «оп» без цифр; был на уроке — клетка пустая.
 *  Сколько уроков пропущено за день — во всплывающей подсказке и в итоговом столбце «Н». */
function cellMark(c: Cell): { cls: string; label: string; title: string } {
  if (!c) return { cls: "x", label: "", title: "нет уроков" };
  const title = `${c.total} ур., Н: ${c.absent}, Ув: ${c.excused}, Оп: ${c.late}`;
  if (c.absent) return { cls: "a", label: "н", title };
  if (c.excused) return { cls: "e", label: "ув", title };
  if (c.late) return { cls: "l", label: "оп", title };
  return { cls: "p", label: "", title };
}

export default function TeacherAttendance() {
  useTitle("Посещаемость");
  const { user } = useAuth();
  const { cls, subject, picker } = useClassPicker({ allowAllSubjects: true });
  const [period, setPeriod] = useState(14);
  const [sort, setSort] = useState<"name" | "risk">("name");
  const from = period === 999 ? "2026-09-01" : addDays(user!.today, -period);
  const path = cls ? `/teacher/attendance?classId=${cls.id}&from=${from}&to=${user!.today}${subject ? `&subjectId=${subject.id}` : ""}` : null;
  const state = useApi<Data>(path);

  return (
    <>
      <PageHead title="Посещаемость" sub={cls ? `${cls.name} · ${cls.students} учащихся${subject ? ` · ${subject.name}` : ""}` : "Выберите класс"} actions={picker} />
      <div className="row wrap toolbar">
        <NbSeg><Seg label="Период" value={period} onChange={setPeriod} options={PERIODS} /></NbSeg>
        <ExportButton
          path={cls ? `/teacher/export/attendance.csv?classId=${cls.id}&from=${from}&to=${user!.today}${subject ? `&subjectId=${subject.id}` : ""}` : null}
          fallbackName={`Посещаемость_${cls?.name ?? "класс"}_${from}_${user!.today}.csv`} />
      </div>
      <Load state={state}>
        {(d) => {
          const students = [...d.students].sort((a, b) => (sort === "risk" ? (a.rate ?? 100) - (b.rate ?? 100) : a.fullName.localeCompare(b.fullName, "ru")));
          return (
            <div className="stack">
              <div className="grid cols-4">
                <Metric icon={<Users size={15} />} label="Посещаемость" value={fmtPct(d.summary.rate)} tone={d.summary.rate != null && d.summary.rate < 90 ? "warn" : "good"} foot="доля уроков, на которых ученики были" />
                <Metric icon={<CalendarRange size={15} />} label="Пропущено уроков" value={d.summary.missedLessons} foot="всего за период" />
                <Metric icon={<UserX size={15} />} label="Без уважительной причины" value={d.summary.unexcused} tone={d.summary.unexcused > 10 ? "warn" : undefined} foot="отметки «н»" />
                <Metric icon={<AlertTriangle size={15} />} label="В зоне риска" value={d.summary.atRisk} tone={d.summary.atRisk ? "warn" : "good"} foot="посещаемость < 85 % или ≥ 4 «н»" />
              </div>

              <NbPage label="Классный журнал: посещаемость">
                <NbHead title="Классный журнал" hint={`${fmtNum(d.from)} — ${fmtNum(d.to)}`}
                  right={<NbSeg><Seg label="Сортировка" value={sort} onChange={setSort} options={[{ value: "name", label: "По алфавиту" }, { value: "risk", label: "Сначала риск" }]} /></NbSeg>} />
                {d.dates.length === 0 ? <Empty title="За этот период уроков не было">Выберите другой период — например, «С 1 сентября».</Empty> : (
                  <div className="nb-tablewrap">
                    <table className="nb-table reg-table">
                      <thead>
                        <tr>
                          <th className="c-n">№</th>
                          <th className="c-name">Ученик</th>
                          {d.dates.map((dt) => <th key={dt} className="c-d"><span>{weekdayShort(dt)}</span><b>{fmtNum(dt).slice(0, 2)}</b></th>)}
                          <th className="right c-sum">Н</th>
                          <th className="right">Ув</th>
                          <th className="right">Явка</th>
                        </tr>
                      </thead>
                      <tbody>
                        {students.map((s, i) => (
                          <tr key={s.id}>
                            <td className="c-n">{i + 1}</td>
                            <td className="c-name">
                              <div className="nb-name">
                                <Link to={`/t/student/${s.id}`} className="person-link small strong ellipsis">{s.fullName.split(" ").slice(0, 2).join(" ")}</Link>
                                {s.atRisk && <span className="nb-flag" title="Зона риска">риск</span>}
                              </div>
                            </td>
                            {s.days.map((c, k) => {
                              const m = cellMark(c);
                              return <td key={k} className="c-d"><span className={`reg-mark ${m.cls}`} title={m.title}>{m.label}</span></td>;
                            })}
                            <td className={`right c-sum nb-att-n ${s.absent ? "has" : ""}`}>{s.absent}</td>
                            <td className="right nb-att-n">{s.excused}</td>
                            <td className="right num strong" style={{ color: s.atRisk ? "var(--amber)" : undefined }}>{fmtPct(s.rate)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="reg-legend">
                  <span><i className="reg-mark inline p" aria-hidden /> пустая клетка — был на всех уроках</span>
                  <span><i className="reg-mark inline a" aria-hidden>н</i> пропустил без причины</span>
                  <span><i className="reg-mark inline e" aria-hidden>ув</i> по уважительной причине</span>
                  <span><i className="reg-mark inline l" aria-hidden>оп</i> опоздание</span>
                </div>
              </NbPage>

              <NbPage label="Динамика посещаемости">
                <NbHead title="Динамика по неделям" hint="с начала учебного года" />
                <div style={{ paddingTop: 14 }}>
                  <LineChart label="Посещаемость по неделям" points={d.weekly.map((w) => ({ x: w.week, y: w.rate }))} min={80} max={100} format={(v) => `${Math.round(v)}%`} color="var(--green)" />
                </div>
              </NbPage>
            </div>
          );
        }}
      </Load>
    </>
  );
}
