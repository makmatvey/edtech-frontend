import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodTypeAny, type z } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Оборачивает обработчик: исключения уходят в общий errorHandler. */
export const h =
  (fn: (req: Request, res: Response) => unknown) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const r = fn(req, res);
      if (r instanceof Promise) r.then((v) => v !== undefined && !res.headersSent && res.json(v)).catch(next);
      else if (r !== undefined && !res.headersSent) res.json(r);
    } catch (e) {
      next(e);
    }
  };

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  return schema.parse(data);
}

export function intParam(v: unknown, name = "id"): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `Некорректный параметр ${name}`);
  return n;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Проверьте введённые данные", details: err.issues.map((i) => i.message) });
  }
  console.error(err);
  res.status(500).json({ error: "Внутренняя ошибка сервера" });
}
