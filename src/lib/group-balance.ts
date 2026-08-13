export type BalanceGroup = {
  balanceTrackingEnabled: boolean
}

export const isBalanceTracked = (group: BalanceGroup | null | undefined) =>
  group?.balanceTrackingEnabled !== false
