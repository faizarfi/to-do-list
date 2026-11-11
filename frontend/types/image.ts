export type ImageTargetFormatOption = "jpg" | "png" | "webp" | "tiff";
export type BulkResizeModeOption = "dimensions" | "percentage";
export type PassportPhotoSizeOption = "2x3" | "3x4" | "4x6";
export type RenameCaseOption = "original" | "lowercase" | "uppercase";
export type CollageLayoutOption = "grid" | "horizontal" | "vertical";
export type CollageFitOption = "cover" | "contain";

export interface ImageMetadataItem {
  filename: string;
  file_size_bytes: number;
  format: string;
  mime_type: string;
  width: number;
  height: number;
  megapixels: number;
  aspect_ratio: string;
  color_mode: string;
  has_alpha: boolean;
  dpi_x: number | null;
  dpi_y: number | null;
  exif: Record<string, string>;
}

export interface ImageInfoResponse {
  count: number;
  items: ImageMetadataItem[];
}

