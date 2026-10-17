import { useEffect, useState } from "react";

export function usePagination<T>(rows: T[], resetKey: string, pageSize = 50) {
  const [requested, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(requested, pages - 1);
  useEffect(() => setPage(0), [resetKey]);
  return { page, pages, setPage, pageRows: rows.slice(page * pageSize, (page + 1) * pageSize), start: rows.length ? page * pageSize + 1 : 0, end: Math.min(rows.length, (page + 1) * pageSize) };
}
