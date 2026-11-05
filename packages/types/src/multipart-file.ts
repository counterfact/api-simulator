/** An in-memory multipart upload. Filenames and content types are client supplied. */
export interface MultipartFile {
  data: Uint8Array;
  filename: string;
  contentType: string;
  size: number;
}
