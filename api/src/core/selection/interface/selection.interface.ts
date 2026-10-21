export interface SelectionSummaryI {
  readonly id: string;
  readonly createdAt: string;
  readonly title: string;
  readonly topPick: string | null;
  readonly candidates: number;
}
