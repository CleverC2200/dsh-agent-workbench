"use client";
import { useState } from "react";

export type RemotePagination = {
  pageNumber: number;
  pageSize: number;
  totalCount: number;
  disabled?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

export function useListPagination<T>(
  rows: readonly T[],
  resetKey: string,
  remote?: RemotePagination,
) {
  const [state, setState] = useState({ key: resetKey, page: 1, size: 10 });
  const page = Math.min(
    state.key === resetKey ? state.page : 1,
    Math.max(1, Math.ceil(rows.length / state.size)),
  );
  if (remote) return { rows, props: remote };
  return {
    rows: rows.slice((page - 1) * state.size, page * state.size),
    props: {
      pageNumber: page,
      pageSize: state.size,
      totalCount: rows.length,
      onPageChange: (next: number) =>
        setState({ key: resetKey, page: next, size: state.size }),
      onPageSizeChange: (size: number) =>
        setState({ key: resetKey, page: 1, size }),
    },
  };
}
