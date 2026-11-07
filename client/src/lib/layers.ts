import { useEffect, useRef } from "react";

/**
 * Стек открытых «слоёв» (модалки, палитра, меню, всплывающие карточки).
 * Esc закрывает только верхний слой — тот, что открыт последним, — а не все сразу.
 * Один общий обработчик на документе вместо отдельного у каждого окна.
 */
type Layer = { id: number; close: () => void };
const stack: Layer[] = [];
let seq = 0;

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== "Escape" || e.defaultPrevented || e.isComposing) return;
  const top = stack[stack.length - 1];
  if (!top) return;
  e.preventDefault();
  top.close();
}

/** Сколько слоёв открыто — например, чтобы не открывать горячими клавишами новое поверх */
export const openLayers = () => stack.length;

/**
 * Пока active === true, слой лежит в стеке; Esc вызывает onClose, только если слой верхний.
 * onClose может меняться между рендерами — позиция слоя в стеке от этого не меняется.
 */
export function useEscapeLayer(active: boolean, onClose: () => void) {
  const cb = useRef(onClose);
  cb.current = onClose;
  useEffect(() => {
    if (!active) return;
    const layer: Layer = { id: ++seq, close: () => cb.current() };
    if (!stack.length) document.addEventListener("keydown", onKeyDown);
    stack.push(layer);
    return () => {
      const i = stack.findIndex((l) => l.id === layer.id);
      if (i >= 0) stack.splice(i, 1);
      if (!stack.length) document.removeEventListener("keydown", onKeyDown);
    };
  }, [active]);
}
