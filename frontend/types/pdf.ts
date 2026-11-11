export type PaperSizeOption = "A4" | "A3" | "Letter" | "Legal" | "Custom";
export type OrientationOption = "portrait" | "landscape" | "auto";
export type FitModeOption = "fit" | "fill";
export type CompressionLevelOption = "low" | "medium" | "high";
export type SplitModeOption = "ranges" | "every_n" | "all_pages";
export type WatermarkTypeOption = "text" | "image";
export type WatermarkPositionOption =
  | "center"
  | "top_left"
  | "top_right"
  | "bottom_left"
  | "bottom_right"
  | "tile";
export type PageNumberPositionOption =
  | "bottom_center"
  | "bottom_right"
  | "bottom_left"
  | "top_center"
  | "top_right"
  | "top_left";

export interface PdfPageInfo {
  page_number: number;
  width_pt: number;
  height_pt: number;
  rotation: number;
  thumbnail_data_url: string | null;
}

export interface PdfInspectResponse {
  filename: string;
  file_size_bytes: number;
  page_count: number;
  is_encrypted: boolean;
  pages: PdfPageInfo[];
}

export interface ExtractedOutputItem {
  name: string;
  sizeBytes: number;
  mimeType: string;
  blob: Blob;
  objectUrl: string;
}

export interface PdfJobResult {
  blob: Blob;
  objectUrl: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number | null;
  outputCount: number | null;
  originalSize: number | null;
  processedSize: number | null;
  ocrPreview: string | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  originalRowCount?: number | null;
  processedRowCount?: number | null;
  removedCount?: number | null;
  csvPreviewRows?: string[][] | null;
  extractedFiles: ExtractedOutputItem[];
}

