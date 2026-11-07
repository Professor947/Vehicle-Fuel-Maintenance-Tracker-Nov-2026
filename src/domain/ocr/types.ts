/** Recognised text line with its box (pixels). Mirrors ML Kit's line output. */
export interface OcrLine {
  text: string;
  top: number;
  left: number;
  height: number;
  width: number;
}

export interface Candidate<T> {
  value: T;
  score: number;
}
