import { useState } from "react";
import { useApi, useTitle } from "../lib/hooks";
import { Load, PageHead, Seg } from "../components/ui";
import { Library as ShelfLibrary } from "./teacher/Manuals";
import type { LibraryResp } from "../lib/materials";
import Videos from "./teacher/Videos";
import Audio from "./teacher/Audio";

type Tab = "books" | "video" | "audio";

/** Учебники и материалы ученика: всё открывается внутри «Класны» */
export default function Library() {
  useTitle("Учебники");
  const [tab, setTab] = useState<Tab>("books");
  return (
    <>
      <PageHead title="Учебники и материалы" sub="Учебники, видеоуроки и аудио своего класса — открываются прямо здесь."
        actions={<Seg label="Раздел" value={tab} onChange={setTab} options={[{ value: "books", label: "Учебники" }, { value: "video", label: "Видеоуроки" }, { value: "audio", label: "Аудио" }]} />} />
      {tab === "books" && <Books />}
      {tab === "video" && <Videos role="student" />}
      {tab === "audio" && <Audio role="student" />}
    </>
  );
}

function Books() {
  const lib = useApi<LibraryResp>("/student/library");
  return (
    <div className="stack" style={{ gap: 20 }}>
      <Load state={lib}>{(d) => <ShelfLibrary d={d} fixedGrade />}</Load>
    </div>
  );
}
