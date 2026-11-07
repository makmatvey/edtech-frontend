import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useApi, useTitle } from "../../lib/hooks";
import { Load, PageHead, Seg } from "../../components/ui";
import { NbHead, NbPage } from "../../components/paper";
import { TextbookShelf } from "../../components/materials";
import { type LibraryResp, type Textbook } from "../../lib/materials";

/** Учебники 5–11 классов: полки с обложками, PDF открывается прямо на сайте */
export default function Manuals() {
  useTitle("Учебники");
  const lib = useApi<LibraryResp>("/teacher/library");

  return (
    <>
      <PageHead title="Учебники" sub="Учебники 5–11 классов — ищите по названию, предмету и классу. Нажмите на учебник, чтобы открыть электронную версию." />
      <div className="stack" style={{ gap: 20 }}>
        <Load state={lib}>{(d) => <Library d={d} />}</Load>
      </div>
    </>
  );
}

/** Полки учебников по классам: «Мои классы» или вся библиотека 5–11 */
export function Library({ d, fixedGrade }: { d: LibraryResp; fixedGrade?: boolean }) {
  const hasMine = !fixedGrade && d.mine.subjects.length > 0;
  const [scope, setScope] = useState<"mine" | "all">(hasMine ? "mine" : "all");
  const [subject, setSubject] = useState("all");
  const [grade, setGrade] = useState("all");
  const [q, setQ] = useState("");
  const norm = (x: string) => x.toLowerCase().replace(/ё/g, "е");
  const subjects = useMemo(() => [...new Map(d.textbooks.map((b) => [b.subject_code, b.subject])).entries()], [d]);

  const books = d.textbooks.filter((b) =>
    (scope === "all" || (d.mine.subjects.includes(b.subject_code) && d.mine.grades.includes(b.grade))) &&
    (subject === "all" || b.subject_code === subject) && (grade === "all" || b.grade === Number(grade)) &&
    (!q.trim() || norm(`${b.title} ${b.subject} ${b.grade}`).includes(norm(q.trim()))));
  const byGrade = new Map<number, Textbook[]>();
  books.forEach((b) => byGrade.set(b.grade, [...(byGrade.get(b.grade) ?? []), b]));
  const loaded = books.filter((b) => b.url).length;

  return (
    <>
      <div className="mat-section-row">
        <span className="mat-count"><b>{books.length}</b> {books.length % 10 === 1 && books.length % 100 !== 11 ? "учебник" : books.length % 10 >= 2 && books.length % 10 <= 4 && (books.length % 100 < 12 || books.length % 100 > 14) ? "учебника" : "учебников"}{loaded ? ` · ${loaded} с PDF` : ""}</span>
        <div className="lib-tools mat-section-tools">
          <div className="mat-search" style={{ flex: "0 1 240px" }}>
            <Search size={16} aria-hidden />
            <input className="input" placeholder="Название, предмет или класс" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск учебника" />
          </div>
          {hasMine && <Seg label="Какие учебники" value={scope} onChange={setScope} options={[{ value: "mine", label: "Мои классы" }, { value: "all", label: "Все 5–11" }]} />}
          <select className="select" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Предмет">
            <option value="all">Все предметы</option>
            {subjects.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
          {scope === "all" && !fixedGrade && (
            <select className="select" value={grade} onChange={(e) => setGrade(e.target.value)} aria-label="Класс">
              <option value="all">Все классы</option>
              {[5, 6, 7, 8, 9, 10, 11].map((g) => <option key={g} value={g}>{g} класс</option>)}
            </select>
          )}
        </div>
      </div>
      {books.length === 0 && <p className="small muted" style={{ margin: 0 }}>Ничего не нашлось — измените запрос или фильтры.</p>}
      {[...byGrade].sort((a, b) => a[0] - b[0]).map(([g, list]) => {
        return (
          <NbPage key={g} label={`Учебники, ${g} класс`}>
            <NbHead title={`${g} класс`} hint={`${list.length} ${list.length === 1 ? "учебник" : list.length < 5 ? "учебника" : "учебников"}`} />
            <TextbookShelf books={list} showGrade={false} role={fixedGrade ? "student" : "teacher"} />
          </NbPage>
        );
      })}
      {!fixedGrade && books.length > loaded && (
        <p className="small muted" style={{ margin: 0 }}>
          Доступные учебники открываются по нажатию на обложку. Ссылки на e-padruchnik открываются в новой вкладке.
        </p>
      )}
    </>
  );
}
