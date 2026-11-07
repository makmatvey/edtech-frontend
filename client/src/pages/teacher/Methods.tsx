import { useMemo, useState } from "react";
import { BookOpenCheck, Lightbulb, MonitorPlay, Puzzle } from "lucide-react";
import { useApi, useTitle } from "../../lib/hooks";
import { Load, PageHead } from "../../components/ui";
import { NbHead, NbPage } from "../../components/paper";
import { FilterBar, FolderEmpty, MaterialRows, groupBySubject, useMaterialFilters } from "../../components/materials";
import { plural, type Material, type MaterialsResp } from "../../lib/materials";

const CATS: { key: string; title: string; hint: string; icon: JSX.Element }[] = [
  { key: "Интерактивные задания", title: "Интерактивные задания", hint: "как создавать и проводить", icon: <Puzzle size={20} /> },
  { key: "Электронные курсы", title: "Электронные курсы", hint: "как собрать курс по предмету", icon: <MonitorPlay size={20} /> },
  { key: "Советы по предметам", title: "Советы по предметам", hint: "методика преподавания", icon: <Lightbulb size={20} /> },
  { key: "Особые темы", title: "Особые темы", hint: "сложные и новые темы программы", icon: <BookOpenCheck size={20} /> },
];
const catOf = (m: Material) => CATS.find((c) => m.category?.startsWith(c.key))?.key ?? "Другое";

/** Методические материалы profil.adu.by: PDF-инструкции и рекомендации */
export default function Methods() {
  useTitle("Методика");
  const state = useApi<MaterialsResp>("/teacher/materials/methods");
  const { f, setF, items } = useMaterialFilters(state.data);
  const [cat, setCat] = useState<string>("all");
  const shown = items.filter((m) => cat === "all" || catOf(m) === cat);
  const counts = useMemo(() => Object.fromEntries(CATS.map((c) => [c.key, items.filter((m) => catOf(m) === c.key).length])), [items]);

  return (
    <>
      <PageHead title="Методика" sub="Инструкции и рекомендации из profil.adu.by: как создавать интерактивные задания и курсы, советы по преподаванию предметов и особых тем." />
      <Load state={state}>
        {(d) => (
          <div className="stack" style={{ gap: 20 }}>
            <div className="meth-cats" role="group" aria-label="Категория">
              {CATS.map((c) => (
                <button key={c.key} type="button" className="meth-cat" aria-pressed={cat === c.key} onClick={() => setCat(cat === c.key ? "all" : c.key)}>
                  <span className="meth-ico" aria-hidden>{c.icon}</span>
                  <span className="meth-t">{c.title}</span>
                  <span className="meth-h">{c.hint}</span>
                  <span className="meth-n">{counts[c.key] ?? 0} {plural(counts[c.key] ?? 0, "документ", "документа", "документов")}</span>
                </button>
              ))}
            </div>
            <FilterBar d={d} f={f} setF={setF} placeholder="Найти инструкцию или рекомендацию" />
            {shown.length === 0 ? (
              <NbPage label="Методика">
                <FolderEmpty d={d} role="teacher" filtered={d.items.length > 0}
                  example={cat === "all" ? "Интерактивные задания/Как создать задание.pdf" : cat === "Советы по предметам" ? "Советы по предметам/<Предмет>/файл.pdf" : `${cat}/файл.pdf`} />
              </NbPage>
            ) : (cat === "Советы по предметам" ? groupBySubject(shown).map((g) => ({ key: g.key, title: g.title, items: g.items }))
              : CATS.filter((c) => cat === "all" || c.key === cat).map((c) => ({ key: c.key, title: c.title, items: shown.filter((m) => catOf(m) === c.key) }))
                .concat(cat === "all" ? [{ key: "other", title: "Другое", items: shown.filter((m) => catOf(m) === "Другое") }] : []))
              .filter((g) => g.items.length > 0)
              .map((g) => (
                <NbPage key={g.key} label={g.title}>
                  <NbHead title={g.title} hint={`${g.items.length} ${plural(g.items.length, "документ", "документа", "документов")}`} />
                  <MaterialRows items={g.items} showSubject showCategory={false} />
                </NbPage>
              ))}
          </div>
        )}
      </Load>
    </>
  );
}
