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
  createdBy: string | null;
};
export type Settlement = {
  id: number;
  fromPerson: string;
  toPerson: string;
  amount: string;
  note: string | null;
  createdAt: string;
  createdBy: string | null;
};
