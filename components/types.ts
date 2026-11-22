export type Expense = {
  id: number;
  description: string;
  amount: string;
  dateTime: string;
  paidBy: string;
  type: "trip" | "personal";
  splitAmong: string[];
  owedTo: string | null;
  naveenPayment: "direct" | "indirect" | null;
  category: string;
};
export type Settlement = {
  id: number;
  fromPerson: string;
  toPerson: string;
  amount: string;
  note: string | null;
  createdAt: string;
};
