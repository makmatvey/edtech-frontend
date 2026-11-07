import { useApi, useTitle } from "../../lib/hooks";
import { Load, PageHead } from "../../components/ui";
import { NbHead, NbPage } from "../../components/paper";
import { FilterBar, FolderEmpty, VideoGrid, groupBySubject, useMaterialFilters } from "../../components/materials";
import { plural, type MaterialsResp } from "../../lib/materials";

/** Видеоуроки ЕИОР — смотреть на уроке или задать посмотреть дома */
export default function Videos({ role = "teacher" }: { role?: "teacher" | "student" }) {
  useTitle("Видеоуроки");
  const state = useApi<MaterialsResp>(`/${role}/materials/video`);
  const { f, setF, items } = useMaterialFilters(state.data, role === "teacher");

  return (
    <>
      {role === "teacher" && <PageHead title="Видеоуроки" sub="Видео ЕИОР по темам программы. Включите на интерактивной доске или задайте посмотреть дома." />}
      <Load state={state}>
        {(d) => (
          <div className="stack" style={{ gap: 20 }}>
            <FilterBar d={d} f={f} setF={setF} placeholder="Найти видеоурок" withMine={role === "teacher"} />
            {items.length === 0 ? (
              <NbPage label="Видеоуроки"><FolderEmpty d={d} role={role} filtered={d.items.length > 0} example="Физика/7/Сила трения.mp4" /></NbPage>
            ) : groupBySubject(items).map((g) => (
              <NbPage key={g.key} label={`Видеоуроки: ${g.title}`}>
                <NbHead title={<span className="cat-subj"><span className="cat-dot" style={{ background: g.color ?? "var(--ink-3)" }} aria-hidden />{g.title}</span>}
                  hint={`${g.items.length} ${plural(g.items.length, "видео", "видео", "видео")}`} />
                <VideoGrid items={g.items} />
              </NbPage>
            ))}
          </div>
        )}
      </Load>
    </>
  );
}
