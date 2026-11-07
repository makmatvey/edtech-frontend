import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Download, X } from "lucide-react";
import { KIND_LABEL, fileUrl, type FileKind } from "../lib/materials";
import { FileBadge } from "./materials";
import { useEscapeLayer } from "../lib/layers";

export type ViewItem = { title: string; url: string; kind: FileKind; subtitle?: string };

const Ctx = createContext<(item: ViewItem) => void>(() => {});

/** Открыть файл из папки materials прямо на сайте: PDF, видео, аудио, картинка. */
export const useViewer = () => useContext(Ctx);

export function ViewerProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<ViewItem | null>(null);
  const close = useCallback(() => setItem(null), []);
  const open = useCallback((next: ViewItem) => {
    if (next.url.startsWith("https://e-padruchnik.adu.by/")) {
      window.open(next.url, "_blank", "noopener,noreferrer");
      return;
    }
    setItem(next);
  }, []);
  return (
    <Ctx.Provider value={open}>
      {children}
      {item && <Viewer item={item} onClose={close} />}
    </Ctx.Provider>
  );
}

function Viewer({ item, onClose }: { item: ViewItem; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEscapeLayer(true, onClose); // Esc закрывает только верхний слой
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [onClose]);

  const fileName = decodeURIComponent(item.url.split(/[?#]/)[0].split("/").pop() ?? "file");
  const src = fileUrl(item.url); // с токеном входа — файлы materials отдаются только вошедшим
  return (
    <div className="viewer-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`viewer viewer-${item.kind}`} role="dialog" aria-modal="true" aria-label={item.title}>
        <header className="viewer-head">
          <FileBadge kind={item.kind} size={34} />
          <div className="viewer-title">
            <b className="ellipsis">{item.title}</b>
            <span className="ellipsis">{item.subtitle ?? KIND_LABEL[item.kind]}</span>
          </div>
          <a className="btn btn-sm" href={src} download={fileName}><Download size={15} /> <span className="hide-sm">Скачать</span></a>
          <button ref={closeRef} className="btn btn-sm btn-ghost btn-icon" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
        </header>
        <div className="viewer-body">
          {item.kind === "pdf" && <iframe src={`${src}#view=FitH`} title={item.title} />}
          {item.kind === "video" && <video src={src} controls autoPlay playsInline />}
          {item.kind === "image" && <img src={src} alt={item.title} />}
          {item.kind === "audio" && (
            <div className="viewer-audio">
              <FileBadge kind="audio" size={88} />
              <audio src={src} controls autoPlay />
            </div>
          )}
          {(item.kind === "doc" || item.kind === "slides") && (
            <div className="viewer-doc">
              <FileBadge kind={item.kind} size={88} />
              <p><b>{KIND_LABEL[item.kind]}</b> открывается в Word или PowerPoint на компьютере.</p>
              <a className="btn btn-primary" href={src} download={fileName}><Download size={16} /> Скачать файл</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
