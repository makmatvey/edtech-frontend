import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { FileText, FileType2, FolderOpen, Image, Music, Pause, Play, Presentation, Search, Video } from "lucide-react";
import { Empty, Modal } from "./ui";
import { NbHead, NbPage } from "./paper";
import { useViewer } from "./Viewer";
import { KIND_LABEL, fileUrl, fmtSize, fmtTime, gradeLabel, plural, type FileKind, type Material, type MaterialsResp, type Textbook } from "../lib/materials";

/* ───────── Значок типа файла ───────── */
export function FileBadge({ kind, size = 30 }: { kind: FileKind; size?: number }) {
  const s = size * 0.5;
  const icon = { pdf: <FileText size={s} />, video: <Video size={s} />, audio: <Music size={s} />, doc: <FileType2 size={s} />, slides: <Presentation size={s} />, image: <Image size={s} /> }[kind];
  return <span className={`file-badge fk-${kind}`} style={{ width: size, height: size, borderRadius: size * 0.28 }} aria-hidden>{icon}</span>;
}

/* ───────── Фильтры: поиск, предмет, класс, «только мои» ───────── */
export type Filters = { q: string; subject: string; grade: string; mineOnly: boolean };

export function useMaterialFilters(d: MaterialsResp | null, withMine = true) {
  const [f, setF] = useState<Filters>({ q: "", subject: "all", grade: "all", mineOnly: withMine });
  const isMine = (m: Material, mine: MaterialsResp["mine"]) =>
    (!m.subject || mine.subjects.includes(m.subject.code)) && (m.grade == null || mine.grades.includes(m.grade));
  // По своим предметам ничего нет (например, аудио у учителя математики) — показываем всё
  useEffect(() => {
    if (d && withMine && d.items.length > 0 && !d.items.some((m) => isMine(m, d.mine))) setF((x) => ({ ...x, mineOnly: false }));
  }, [d, withMine]);
  const items = useMemo(() => {
    if (!d) return [];
    const q = f.q.trim().toLowerCase().replace(/ё/g, "е");
    return d.items.filter((m) =>
      (!f.mineOnly || isMine(m, d.mine)) &&
      (f.subject === "all" || m.subject?.code === f.subject || (f.subject === "none" && !m.subject)) &&
      (f.grade === "all" || m.grade === Number(f.grade)) &&
      (!q || `${m.title} ${m.category ?? ""} ${m.subject?.name ?? ""}`.toLowerCase().replace(/ё/g, "е").includes(q)));
  }, [d, f]);
  return { f, setF, items };
}

export function FilterBar({ d, f, setF, placeholder, withMine = true, extra }: {
  d: MaterialsResp; f: Filters; setF: (f: Filters) => void; placeholder: string; withMine?: boolean; extra?: ReactNode;
}) {
  const subjects = useMemo(() => {
    const m = new Map<string, string>();
    d.items.forEach((x) => x.subject && m.set(x.subject.code, x.subject.name));
    return [...m].sort((a, b) => a[1].localeCompare(b[1], "ru"));
  }, [d]);
  const grades = useMemo(() => [...new Set(d.items.map((x) => x.grade).filter((g): g is number => g != null))].sort((a, b) => a - b), [d]);
  return (
    <div className="lib-tools">
      <div className="mat-search">
        <Search size={16} aria-hidden />
        <input className="input" placeholder={placeholder} value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} aria-label="Поиск" />
      </div>
      {subjects.length > 1 && (
        <select className="select" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} aria-label="Предмет">
          <option value="all">Все предметы</option>
          {subjects.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
      )}
      {grades.length > 1 && (
        <select className="select" value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value })} aria-label="Класс">
          <option value="all">Все классы</option>
          {grades.map((g) => <option key={g} value={g}>{g} класс</option>)}
        </select>
      )}
      {extra}
      {withMine && (
        <label className="mat-mine">
          <input type="checkbox" checked={f.mineOnly} onChange={(e) => setF({ ...f, mineOnly: e.target.checked })} />
          Только мои предметы и классы
        </label>
      )}
    </div>
  );
}

/* ───────── Пустое состояние: куда положить файлы ───────── */
const EMPTY_WHAT: Record<string, string> = { video: "видеоуроки", audio: "аудиозаписи", methods: "методические материалы" };

export function FolderEmpty({ d, role, filtered, example }: { d: MaterialsResp; role: "teacher" | "student"; filtered: boolean; example?: string }) {
  if (filtered) return <Empty icon={<Search size={28} />} title="Ничего не нашлось">Измените запрос или снимите фильтры.</Empty>;
  if (role === "student") return <Empty icon={<FolderOpen size={30} />} title="Материалы скоро появятся">Учитель ещё не добавил файлы в этот раздел.</Empty>;
  return (
    <Empty icon={<FolderOpen size={30} />} title={`Здесь появятся ${EMPTY_WHAT[d.section.key] ?? "материалы"}`}>
      <span>Файлы добавляются один раз — и сразу открываются у всех учителей и учеников прямо на сайте, без перехода на другие ресурсы.</span>
      <details className="mat-howto">
        <summary>Как добавить файлы</summary>
        <span>Положите файл в папку <code className="mat-path-inline">materials/{d.section.folder}/{example ?? "<Предмет>/<класс>/"}</code> — он появится здесь через несколько секунд. Подходят: {d.section.exts.map((e) => `.${e}`).join(", ")}.</span>
      </details>
    </Empty>
  );
}

/* ───────── Полка учебников: обложки, PDF из materials/Учебники ───────── */
/** Символ предмета на нарисованной обложке */
const GLYPH: Record<string, string> = {
  belarusian: "Ўў", literature_by: "❧", russian: "Аа", literature_ru: "❦", english: "Ab", math: "÷", algebra: "x²", geometry: "△",
  informatics: "</>", world_history: "Ⅻ", history_by: "Ⅸ", social: "§", geography: "◎", biology: "✿", physics: "λ", chemistry: "H₂O",
  drafting: "∠", astronomy: "★",
};

function BookCover({ b, partMark }: { b: Textbook; partMark?: string }) {
  return (
    <>
      <span className={`shelf-cover ${b.cover ? "has-img" : ""}`} aria-hidden>
        {b.cover ? <img src={fileUrl(b.cover)} alt="" loading="lazy" /> : (
          <>
            <span className="shelf-cover-glyph">{GLYPH[b.subject_code] ?? "§"}</span>
            <span className="shelf-cover-subj">{b.subject}</span>
            <span className="shelf-cover-grade">
              {partMark ?? b.grade}
              <small>{partMark ? (b.language === "be" ? "частка" : "часть") : (b.language === "be" ? "клас" : "класс")}</small>
            </span>
          </>
        )}
        {partMark && b.cover && <span className="shelf-part-badge">{partMark}</span>}
      </span>
      <span className="shelf-plank" aria-hidden />
    </>
  );
}

export function TextbookShelf({ books, role = "teacher" }: { books: Textbook[]; showGrade?: boolean; role?: "teacher" | "student" }) {
  const view = useViewer();
  const [pick, setPick] = useState<Textbook | null>(null);
  const open = (b: Textbook, url: string, part?: string) =>
    view({ title: part ? `${b.title} · ${part}` : b.title, url, kind: "pdf", subtitle: "Учебник" });
  const preview = (b: Textbook, part?: string) => b.cover && view({
    title: part ? `${b.title} · ${part}` : b.title, url: b.cover, kind: "image",
    subtitle: role === "teacher" ? "электронную версию можно подключить: PDF в папку учебника" : "электронная версия скоро появится",
  });
  const openPart = (b: Textbook, p: Textbook["parts"][number], i: number) => {
    const label = partLabel(p.title, i);
    if (p.url) open(b, p.url, label);
    else preview(b, label);
    setPick(null);
  };
  const pickParts = pick?.parts ?? [];
  return (
    <>
      <div className="shelf">
        {books.map((b) => {
          const style = { "--c": b.color } as CSSProperties;
          return (
            <button key={b.key} type="button" className={`shelf-book${!b.url ? " no-pdf" : ""}`} style={style}
              disabled={!b.url && !b.cover}
              onClick={() => b.parts.length > 1 ? setPick(b) : b.url ? open(b, b.url) : preview(b)}
              aria-label={b.parts.length > 1 ? `Выбрать часть: ${b.title}` : b.url ? `Открыть: ${b.title}` : `${b.title}: PDF пока нет`}>
              <BookCover b={b} />
              <span className={`shelf-title${b.url || b.cover ? " is-link" : ""}`}>{b.title}</span>
            </button>
          );
        })}
      </div>
      {pick && (
        <Modal label={`${pick.title}: выберите часть`} onClose={() => setPick(null)} className="modal-parts">
          <div className="shelf-pick-head">
            <h2>{pick.title}</h2>
            <p>Выберите часть учебника</p>
          </div>
          <div className="shelf-pick">
            {pickParts.map((p, i) => {
              const label = partLabel(p.title, i);
              return (
                <button key={`${pick.key}-${i}`} type="button" className={`shelf-book${!p.url ? " no-pdf" : ""}`}
                  style={{ "--c": pick.color } as CSSProperties}
                  onClick={() => openPart(pick, p, i)}
                  aria-label={p.url ? `Открыть: ${pick.title}, ${label}` : `${pick.title}, ${label}: PDF пока нет`}
                  title={!p.url ? (role === "teacher" ? "Положите PDF «Часть 1/2» в папку учебника" : "Электронная версия скоро появится") : undefined}>
                  <BookCover b={pick} partMark={String(i + 1)} />
                  <span className={`shelf-title${p.url ? " is-link" : ""}`}>{label}</span>
                </button>
              );
            })}
          </div>
        </Modal>
      )}
    </>
  );
}

/** «Алгебра 7 часть 2» → «Часть 2»; иначе «Часть N» */
const partLabel = (title: string, i: number) => (/час(ть|тка)\s*\d/i.test(title) ? title.match(/час(ть|тка)\s*\d+/i)![0].replace(/^./, (c) => c.toUpperCase()) : `Часть ${i + 1}`);

/* ───────── Список документов, сгруппированный по предметам ───────── */
export function groupBySubject(items: Material[]) {
  const m = new Map<string, { key: string; title: string; color: string | null; items: Material[] }>();
  for (const it of items) {
    const key = it.subject?.code ?? "_";
    const g = m.get(key) ?? { key, title: it.subject?.name ?? "Для всех предметов", color: it.subject?.color ?? null, items: [] };
    g.items.push(it);
    m.set(key, g);
  }
  return [...m.values()].sort((a, b) => (a.key === "_" ? 1 : b.key === "_" ? -1 : a.title.localeCompare(b.title, "ru")));
}

export function materialSub(m: Material, opts: { subject?: boolean; category?: boolean } = {}) {
  return [opts.subject && m.subject?.name, gradeLabel(m.grade), opts.category !== false && m.category, KIND_LABEL[m.kind], fmtSize(m.size)].filter(Boolean).join(" · ");
}

export function MaterialRows({ items, showSubject = false, showCategory = true }: { items: Material[]; showSubject?: boolean; showCategory?: boolean }) {
  const view = useViewer();
  return (
    <ul className="nb-rows mat-rows">
      {items.map((m, i) => (
        <li key={m.id}>
          <button type="button" className="nb-row" onClick={() => view({ title: m.title, url: m.url, kind: m.kind, subtitle: materialSub(m, { subject: true }) })}>
            <span className="nb-n">{i + 1}</span>
            <FileBadge kind={m.kind} size={30} />
            <span style={{ minWidth: 0 }}>
              <span className="nb-title" style={{ display: "block" }}>{m.title}</span>
              <span className="nb-sub" style={{ display: "block" }}>{materialSub(m, { subject: showSubject, category: showCategory })}</span>
            </span>
            <span className="mat-ext">{m.ext}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function GroupedMaterials({ items, label }: { items: Material[]; label: string }) {
  return (
    <>
      {groupBySubject(items).map((g) => (
        <NbPage key={g.key} label={`${label}: ${g.title}`}>
          <NbHead title={<span className="cat-subj"><span className="cat-dot" style={{ background: g.color ?? "var(--ink-3)" }} aria-hidden />{g.title}</span>}
            hint={`${g.items.length} ${plural(g.items.length, "файл", "файла", "файлов")}`} />
          <MaterialRows items={g.items} />
        </NbPage>
      ))}
    </>
  );
}

/* ───────── Видеоуроки: карточки с кадром из ролика ───────── */
export function VideoGrid({ items }: { items: Material[] }) {
  const view = useViewer();
  return (
    <div className="vid-grid">
      {items.map((m) => <VideoCard key={m.id} m={m} onOpen={() => view({ title: m.title, url: m.url, kind: "video", subtitle: materialSub(m, { subject: true }) })} />)}
    </div>
  );
}

function VideoCard({ m, onOpen }: { m: Material; onOpen: () => void }) {
  const [dur, setDur] = useState<number | null>(null);
  const [near, setNear] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  // Кадр-превью грузим, только когда карточка близко к экрану
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) { setNear(true); return; }
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && (setNear(true), io.disconnect()), { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <button ref={ref} type="button" className="vid-card" onClick={onOpen} style={{ "--c": m.subject?.color ?? "var(--blue)" } as CSSProperties}>
      <span className="vid-thumb">
        {near && <video src={`${fileUrl(m.url)}#t=2`} preload="metadata" muted playsInline tabIndex={-1} aria-hidden onLoadedMetadata={(e) => setDur(e.currentTarget.duration)} />}
        <span className="vid-play" aria-hidden><Play size={22} fill="currentColor" /></span>
        {dur != null && <span className="vid-dur">{fmtTime(dur)}</span>}
      </span>
      <span className="vid-info">
        <span className="vid-title">{m.title}</span>
        <span className="vid-meta">
          {m.subject && <span className="cat-dot" style={{ background: m.subject.color }} aria-hidden />}
          {[m.subject?.name, gradeLabel(m.grade), m.category].filter(Boolean).join(" · ")}
        </span>
      </span>
    </button>
  );
}

/* ───────── Аудио: один плеер на страницу, скорость для аудирования ───────── */
const RATES = [0.75, 1, 1.25];

export function AudioList({ groups }: { groups: { key: string; title: ReactNode; hint?: string; items: Material[] }[] }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [cur, setCur] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [rate, setRate] = useState(1);

  useEffect(() => { if (audio.current) audio.current.playbackRate = rate; }, [rate, cur]);

  function toggle(m: Material) {
    const a = audio.current!;
    if (cur === m.id) { if (a.paused) void a.play(); else a.pause(); return; }
    setCur(m.id); setT(0); setDur(0);
    a.src = fileUrl(m.url);
    a.playbackRate = rate;
    void a.play();
  }

  return (
    <>
      <audio ref={audio} preload="none"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)} onLoadedMetadata={(e) => setDur(e.currentTarget.duration)} />
      {groups.map((g) => (
        <NbPage key={g.key} label={typeof g.title === "string" ? g.title : g.key}>
          <NbHead title={g.title} hint={g.hint} />
          <ul className="nb-rows aud-rows">
            {g.items.map((m, i) => {
              const on = cur === m.id;
              return (
                <li key={m.id} className={on ? "is-on" : ""}>
                  <div className="nb-row">
                    <span className="nb-n">{i + 1}</span>
                    <button type="button" className={`aud-btn ${on && playing ? "playing" : ""}`} onClick={() => toggle(m)}
                      aria-label={`${on && playing ? "Пауза" : "Слушать"}: ${m.title}`}>
                      {on && playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                    </button>
                    <span style={{ minWidth: 0 }}>
                      <span className="nb-title" style={{ display: "block" }}>{m.title}</span>
                      {on ? (
                        <span className="aud-bar">
                          <input type="range" min={0} max={dur || 0} step={0.1} value={Math.min(t, dur || 0)} aria-label="Перемотка"
                            style={{ "--p": `${dur ? (t / dur) * 100 : 0}%` } as CSSProperties}
                            onChange={(e) => { const a = audio.current!; a.currentTime = Number(e.target.value); setT(a.currentTime); }} />
                          <span className="aud-time">{fmtTime(t)} / {fmtTime(dur)}</span>
                        </span>
                      ) : (
                        <span className="nb-sub" style={{ display: "block" }}>{[m.category, fmtSize(m.size)].filter(Boolean).join(" · ")}</span>
                      )}
                    </span>
                    {on ? (
                      <span className="aud-rates" role="group" aria-label="Скорость">
                        {RATES.map((r) => <button key={r} type="button" aria-pressed={rate === r} onClick={() => setRate(r)}>{String(r).replace(".", ",")}×</button>)}
                      </span>
                    ) : <span className="mat-ext">{m.ext}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </NbPage>
      ))}
    </>
  );
}
