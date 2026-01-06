import { Question } from './types';

export const QUESTIONS: Question[] = [
  {
    id: 1,
    question: "Use mental math to find the sum or difference. 4.25 + 1.36 + 2.75 = ___",
    answer: "8.36"
  },
  {
    id: 2,
    question: "Use mental math to find the sum or difference. 12.78 + 5.25 = ___",
    answer: "18.03"
  },
  {
    id: 3,
    question: "Use mental math to find the sum or difference. 17.4 - 13.6 = ___",
    answer: "3.8"
  },
  {
    id: 4,
    question: "Use mental math to find the sum or difference. 29.8 - 2.27 = ___",
    answer: "27.53"
  },
  {
    id: 5,
    question: "Use mental math to find the sum or difference. 1.25 + 2.45 + 1.75 = ___",
    answer: "5.45"
  },
  {
    id: 6,
    question: "Use mental math to find the sum or difference. 8.4 + 6.15 + 2.6 = ___",
    answer: "17.15"
  },
  {
    id: 7,
    question: "Use mental math to find the sum or difference. 17.82 - 15.61 = ___",
    answer: "2.21"
  },
  {
    id: 8,
    question: "Use mental math to find the sum or difference. 35.7 - 13.8 = ___",
    answer: "21.9"
  },
  {
    id: 9,
    question: "Two years ago, your friend was 1.25 meters tall. Today, your friend is 1.48 meters tall. How many meters did your friend grow?",
    answer: "0.23"
  },
  {
    id: 10,
    question: "Clothing items are donated to an organization. How many pounds of clothing are donated altogether?",
    answer: "134.8",
    data: {
      type: "table",
      headers: ["Clothing Item", "Donations (pounds)"],
      rows: [
        ["Shirts", 37.4],
        ["Pants", 54.8],
        ["Coats", 42.6]
      ]
    }
  },
  {
    id: 11,
    question: "MP Reasoning: Can you use the Commutative Property to find the difference of two decimals? Explain.",
    answer: "No, subtraction is not commutative."
  },
  {
    id: 12,
    question: "DIG DEEPER: Use each digit from 1 through 8 once to complete the problem. [ ][ ].[ ][ ] + [ ][ ].[ ][ ] = 101.52",
    answer: "25.14 + 76.38"
  }
];
