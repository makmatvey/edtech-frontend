import { Link } from "react-router-dom";
import { Check, CheckCircle2, Flame, Lightbulb, Target, Users } from "lucide-react";
import { useApi, useTitle } from "../../lib/hooks";
import { useAuth } from "../../lib/auth";
import { useClassPicker } from "../../components/ClassPicker";
import { Empty, Load, Metric, PageHead } from "../../components/ui";
import { NbHead, NbPage } from "../../components/paper";
import { WeakHeatmap } from "../../components/charts";
import { relDay } from "../../lib/format";

type Data = {
  students: { id: number; fullName: string; shortName: string; streak: number; todayDone: boolean; lastActivity: string | null; quizzes: number; accuracy: number | null }[];
  activeToday: number; active7: number; total: number;
  weak: { subject: string; color: string; section: string; accuracy: number; total: number; className: string }[];
};

export default function TeacherActivity() {
  useTitle("Активность класса");
  const { user } = useAuth();
  const { cls, subject, picker } = useClassPicker({ allowAllSubjects: true });
  const state = useApi<Data>(cls ? `/teacher/insights?classId=${cls.id}` : null);

  return (
    <>
      <PageHead
        title="Активность класса"
        sub={cls ? `${cls.name} · ${cls.students} учащихся${subject ? ` · ${subject.name}` : " · все ваши предметы"}` : "Выберите класс"}
        actions={picker}
      />
      <Load state={state}>
        {(d) => {
          const withAcc = d.students.filter((s) => s.accuracy != null);
          const avgAcc = withAcc.length ? Math.round(withAcc.reduce((a, s) => a + (s.accuracy ?? 0), 0) / withAcc.length) : null;
          const weak = subject ? d.weak.filter((w) => w.subject === subject.name) : d.weak;
          return (
            <div className="stack">
              <div className="grid cols-4">
                <Metric icon={<CheckCircle2 size={15} />} label="Прошли квиз сегодня" value={`${d.activeToday} / ${d.total}`} />
                <Metric icon={<Users size={15} />} label="Активны за 7 дней" value={`${d.active7} / ${d.total}`} tone={d.active7 / Math.max(1, d.total) >= 0.6 ? "good" : "warn"} />
                <Metric icon={<Target size={15} />} label="Точность ответов" value={avgAcc == null ? "—" : `${avgAcc}%`} foot="средняя за 14 дней" />
                <Metric icon={<Flame size={15} />} label="Лучший стрик в классе" value={Math.max(0, ...d.students.map((s) => s.streak))} foot="дней подряд" />
              </div>

              <NbPage label="Темы, которые стоит повторить">
                <NbHead title="Темы, которые стоит повторить" hint="доля верных ответов в квизах" />
                {weak.length === 0 ? (
                  <Empty icon={<Lightbulb size={26} />} title="Пока недостаточно ответов">Нужно хотя бы 5 ответов по разделу, чтобы показать статистику.</Empty>
                ) : (
                  <WeakHeatmap items={weak} />
                )}
              </NbPage>

              <NbPage label="Ученики">
                <NbHead title="Ученики" hint="по длине стрика" />
                <div className="nb-tablewrap">
                  <table className="nb-table">
                    <thead><tr><th className="c-n">№</th><th className="c-name">Ученик</th><th className="center">Стрик</th><th>Квиз сегодня</th><th>Последняя активность</th><th className="right">Квизов</th><th className="right">Точность</th></tr></thead>
                    <tbody>
                      {d.students.map((s, i) => (
                        <tr key={s.id}>
                          <td className="c-n">{i + 1}</td>
                          <td className="c-name"><div className="nb-name"><Link to={`/t/student/${s.id}`} className="person-link small strong">{s.fullName.split(" ").slice(0, 2).join(" ")}</Link></div></td>
                          <td className="center"><span className={`nb-streak ${s.streak ? "on" : ""}`}><Flame size={14} aria-hidden />{s.streak}</span></td>
                          <td>{s.todayDone ? <span className="nb-ok"><Check size={14} aria-hidden /> пройден</span> : <span className="muted small">—</span>}</td>
                          <td className="small">{s.lastActivity ? relDay(s.lastActivity, user!.today) : <span className="muted">не начинал</span>}</td>
                          <td className="right num">{s.quizzes}</td>
                          <td className="right num">{s.accuracy == null ? "—" : `${s.accuracy}%`}</td>
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
