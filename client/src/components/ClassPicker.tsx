import { useEffect } from "react";
import { useApi, useLocalState } from "../lib/hooks";

export type TeacherClass = {
  id: number; name: string; grade: number; homeroom: boolean; students: number; joinCode: string | null;
  subjects: { id: number; code: string; name: string; color: string; hours: number }[];
};

/** Выбор класса (и предмета) для страниц аналитики учителя. Выбор запоминается. */
export function useClassPicker(opts: { allowAllSubjects: boolean }) {
  const classes = useApi<TeacherClass[]>("/teacher/classes");
  const [classId, setClassId] = useLocalState<number | null>("klasna.t.class", null);
  const [subjectId, setSubjectId] = useLocalState<number | null>("klasna.t.subject", null);
  const list = classes.data ?? [];
  const cls = list.find((c) => c.id === classId) ?? list.find((c) => c.homeroom) ?? list[0] ?? null;
  const subjects = cls?.subjects ?? [];
  const subject = subjects.find((s) => s.id === subjectId) ?? (opts.allowAllSubjects ? null : subjects[0] ?? null);

  useEffect(() => {
    if (cls && cls.id !== classId) setClassId(cls.id);
  }, [cls, classId, setClassId]);

  const picker = (
    <div className="row wrap">
      <label className="sr-only" htmlFor="cls">Класс</label>
      <select id="cls" className="select" value={cls?.id ?? ""} onChange={(e) => { setClassId(Number(e.target.value)); }}>
        {list.map((c) => (
          <option key={c.id} value={c.id}>{c.name}{c.homeroom ? " · классное руководство" : ""}</option>
        ))}
      </select>
      <label className="sr-only" htmlFor="subj">Предмет</label>
      <select id="subj" className="select" value={subject?.id ?? ""} onChange={(e) => setSubjectId(e.target.value ? Number(e.target.value) : null)}>
        {opts.allowAllSubjects && <option value="">{cls && cls.homeroom ? "Все предметы класса" : "Все мои предметы"}</option>}
        {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </div>
  );
  return { classes, cls, subject, picker };
}
