import { useMemo, useState } from "react";
import { useApi, useTitle } from "../../lib/hooks";
import { Load, PageHead, Seg } from "../../components/ui";
import { NbPage } from "../../components/paper";
import { AudioList, FilterBar, FolderEmpty, useMaterialFilters } from "../../components/materials";
import { gradeLabel, plural, type Material, type MaterialsResp } from "../../lib/materials";

/** Аудио для языков (Lingvo): аудирование, диалоги, произношение */
export default function Audio({ role = "teacher" }: { role?: "teacher" | "student" }) {
  useTitle("Аудио для языков");
  const state = useApi<MaterialsResp>(`/${role}/materials/audio`);
  const { f, setF, items } = useMaterialFilters(state.data, role === "teacher");
  const langs = useMemo(() => {
    const m = new Map<string, string>();
    (state.data?.items ?? []).forEach((x) => m.set(x.subject?.code ?? "_", x.subject?.name ?? "Другое"));
    return [...m].sort((a, b) => a[1].localeCompare(b[1], "ru"));
  }, [state.data]);
  const [lang, setLang] = useState("all");
  const shown = items.filter((m) => lang === "all" || (m.subject?.code ?? "_") === lang);

  // Группы: язык · класс · подборка (например «Unit 3»)
  const groups = useMemo(() => {
    const g = new Map<string, { key: string; title: string; hint?: string; items: Material[] }>();
    for (const m of shown) {
      const key = `${m.subject?.code ?? "_"}|${m.grade ?? ""}|${m.category ?? ""}`;
      const title = [m.subject?.name ?? "Другое", m.grade != null ? gradeLabel(m.grade) : null, m.category].filter(Boolean).join(" · ");
      const x = g.get(key) ?? { key, title, items: [] };
      x.items.push(m);
      g.set(key, x);
    }
    return [...g.values()].map((x) => ({ ...x, hint: `${x.items.length} ${plural(x.items.length, "запись", "записи", "записей")}` }));
  }, [shown]);

  return (
    <>
      {role === "teacher" && <PageHead title="Аудио для языков" sub="Записи для аудирования и произношения. Можно замедлить до 0,75× — удобно на уроке." />}
      <Load state={state}>
        {(d) => (
          <div className="stack" style={{ gap: 20 }}>
            <FilterBar d={d} f={f} setF={setF} placeholder="Найти запись" withMine={role === "teacher"}
              extra={langs.length > 1 ? <Seg label="Язык" value={lang} onChange={setLang} options={[{ value: "all", label: "Все языки" }, ...langs.map(([v, l]) => ({ value: v, label: l }))]} /> : undefined} />
            {groups.length === 0
              ? <NbPage label="Аудио"><FolderEmpty d={d} role={role} filtered={d.items.length > 0} example="Английский язык/7/Unit 3/Dialogue 1.mp3" /></NbPage>
              : <AudioList groups={groups} />}
          </div>
        )}
      </Load>
    </>
  );
}
