export interface Question {
  id: number;
  question: string;
  answer: string;
  data?: {
    type: 'table';
    headers: string[];
    rows: (string | number)[][];
  };
}
