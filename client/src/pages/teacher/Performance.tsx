import { useState } from "react";
import { Link } from "react-router-dom";
import { Award, GraduationCap, Hash, TrendingDown, TrendingUp, TriangleAlert } from "lucide-react";
import { useApi, useTitle } from "../../lib/hooks";
import { useClassPicker } from "../../components/ClassPicker";
import { Load, Mark, Metric, PageHead, Seg } from "../../components/ui";
import { NbHead, NbPage, NbSeg } from "../../components/paper";
import { BarRow, GradeBars, LineChart } from "../../components/charts";
import { ExportButton } from "../../components/ExportButton";
import { fmtAvg, fmtPct } from "../../lib/format";

type Data = {
  quarter: number; from: string; to: string; average: number | null; count: number; quality: number | null;
  distribution: { value: number; count: number }[];
  subjects: { id: number; name: string; color: string; average: number | null; count: number }[];
  weekly: { week: string; average: number | null }[];
  students: { id: number; fullName: string; shortName: string; average: number | null; count: number; recent: { value: number; kind: string; date: string }[]; trend: number; needsAttention: boolean }[];
};

export default function TeacherPerformance() {
  useTitle("Успеваемость");
  const { cls, subject, picker } = useClassPicker({ allowAllSubjects: true });
  const [quarter, setQuarter] = useState<number>(0);
  const [filter, setFilter] = useState<"all" | "attention">("all");
  const path = cls ? `/teacher/performance?classId=${cls.id}&quarter=${quarter}${subject ? `&subjectId=${subject.id}` : ""}` : null;
  const state = useApi<Data>(path);

  return (
    <>
      <PageHead title="Успеваемость" sub={cls ? `${cls.name}${subject ? ` · ${subject.name}` : " · все ваши предметы"} · 10-балльная шкала` : ""} actions={picker} />
      <div className="row wrap toolbar">
        <NbSeg><Seg label="Четверть" value={quarter} onChange={setQuarter} options={[{ value: 0, label: "С начала года" }, { value: 1, label: "I четверть" }, { value: 2, label: "II четверть" }]} /></NbSeg>
        <ExportButton
          path={cls ? `/teacher/export/grades.csv?classId=${cls.id}&quarter=${quarter}${subject ? `&subjectId=${subject.id}` : ""}` : null}
          fallbackName={`Успеваемость_${cls?.name ?? "класс"}.csv`} />
      </div>
      <Load state={state}>
        {(d) => {
          const attention = d.students.filter((s) => s.needsAttention);
          const list = filter === "attention" ? attention : d.students;
          return (
            <div className="stack">
              <div className="grid cols-4">
                <Metric icon={<GraduationCap size={15} />} label="Средний балл" value={fmtAvg(d.average, 2)} foot={d.quarter ? `${d.quarter}-я четверть` : "с 1 сентября"} />
                <Metric icon={<Award size={15} />} label="Качество знаний" value={fmtPct(d.quality)} foot="доля оценок 7–10" />
                <Metric icon={<Hash size={15} />} label="Выставлено оценок" value={d.count} foot="за выбранный период" />
                <Metric icon={<TriangleAlert size={15} />} label="Требуют внимания" value={attention.length} tone={attention.length ? "warn" : "good"} foot="средний < 5 или падение" />
              </div>

              <div className="grid cols-2">
                <NbPage label="Распределение оценок">
                  <NbHead title="Распределение оценок" hint={`${d.count} оценок`} />
                  <div style={{ paddingTop: 14 }}>
                    {d.count === 0 ? <p className="muted small">Оценок за этот период пока нет.</p> : <GradeBars data={d.distribution} />}
                  </div>
                </NbPage>
                <NbPage label="Средний балл по неделям">
                  <NbHead title="Средний балл по неделям" />
                  <div style={{ paddingTop: 14 }}>
                    <LineChart label="Средний балл по неделям" points={d.weekly.map((w) => ({ x: w.week, y: w.average }))} min={4} max={10} format={(v) => v.toFixed(1).replace(".", ",")} />
                  </div>
                </NbPage>
              </div>

              {d.subjects.length > 1 && (
                <NbPage label="По предметам">
                  <NbHead title="По предметам" />
                  <div className="nb-bars">
                    {d.subjects.map((s) => (
                      <BarRow key={s.id} label={s.name} value={s.average} max={10} color={s.color} display={fmtAvg(s.average)} />
                    ))}
                  </div>
                </NbPage>
              )}

              <NbPage label="Ученики">
                <NbHead title="Ученики" hint="обведена — контрольная, подчёркнута — самостоятельная"
                  right={<NbSeg><Seg label="Фильтр" value={filter} onChange={setFilter} options={[{ value: "all", label: "Все" }, { value: "attention", label: `Внимание (${attention.length})` }]} /></NbSeg>} />
                <div className="nb-tablewrap">
                  <table className="nb-table">
                    <thead>
                      <tr><th className="c-n">№</th><th className="c-name">Ученик</th><th>Последние оценки</th><th className="right">Средний</th><th className="right">Динамика</th></tr>
                    </thead>
                    <tbody>
                      {list.map((s, i) => (
                        <tr key={s.id}>
                          <td className="c-n">{i + 1}</td>
                          <td className="c-name">
                            <div className="nb-name">
                              <Link to={`/t/student/${s.id}`} className="person-link small strong">{s.fullName.split(" ").slice(0, 2).join(" ")}</Link>
                              {s.needsAttention && <span className="nb-flag">внимание</span>}
                            </div>
                          </td>
                          <td><div className="nb-marks">{s.recent.length ? s.recent.map((g, k) => <Mark key={k} value={g.value} kind={g.kind} size="sm" />) : <span className="muted small">нет оценок</span>}</div></td>
                          <td className="right"><span className="nb-avg">{fmtAvg(s.average)}</span></td>
                          <td className="right">
                            {s.trend >= 0.6 ? <span className="nb-trend up"><TrendingUp size={14} aria-hidden /> +{String(s.trend).replace(".", ",")}</span>
                              : s.trend <= -0.6 ? <span className="nb-trend down"><TrendingDown size={14} aria-hidden /> {String(s.trend).replace(".", ",").replace("-", "−")}</span>
                              : <span className="muted small">стабильно</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </NbPage>
            </div>
          );
        }}
      </Load>
    </>
  );
}
