import type { SVGProps } from 'react';
type Props = SVGProps<SVGSVGElement> & { size?: number };
function icon(path: string) {
  return function Icon({ size = 16, ...p }: Props) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...p}
      >
        <path d={path} />
      </svg>
    );
  };
}
export const ChevronDown = icon('m6 9 6 6 6-6'),
  ChevronRight = icon('m9 6 6 6-6 6'),
  Check = icon('m5 12 4 4L19 6'),
  X = icon('m6 6 12 12M6 18 18 6'),
  Search = icon('M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0'),
  Download = icon('M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4'),
  RotateCcw = icon('M3 9a9 9 0 1 1 0 7M3 3v6h6'),
  LoaderCircle = icon('M21 12a9 9 0 1 1-9-9'),
  AlertTriangle = icon('M12 3 2 21h20L12 3Zm0 6v5m0 3v1'),
  SlidersHorizontal = icon('M3 6h7m4 0h7M3 12h12m4 0h2M3 18h3m4 0h11M10 3v6m5 0v6M6 15v6'),
  Columns3 = icon('M3 4h18v16H3ZM9 4v16m6-16v16'),
  FileSpreadsheet = icon('M4 3h12l4 4v14H4ZM8 10h8m-8 4h8m-4-4v8'),
  Sparkles = icon('m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z');
export const IconDown = ChevronDown,
  IconRight = ChevronRight,
  IconClose = X,
  IconDownload = Download,
  IconRefresh = RotateCcw,
  IconFile = FileSpreadsheet,
  IconInfoCircle = icon('M12 8v1m0 3v5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0');
