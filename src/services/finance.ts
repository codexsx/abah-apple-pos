// Feature: finance-menu
import {
  buildFinanceSummary,
  type FinanceSummary,
  type FinancePeriod,
} from '@/services/financeCore';
import { getTransactions } from '@/services/transactions';
import { getAccounts } from '@/services/accounts';
import { getStockItems } from '@/services/stock';
import {
  getAgents,
  getAgentTransactions,
  getAgentBalanceBreakdown,
} from '@/services/agents';

/** Optional reporting-period bounds; a null/absent bound is unbounded (Req 3.x). */
export interface FinancePeriodInput {
  from?: string | null;
  to?: string | null;
}

export interface FinanceSummaryOptions {
  includeAgentMoney?: boolean;
}

/**
 * Gather the live data needed for the read-only finance summary and delegate
 * the roll-ups to the pure `buildFinanceSummary` core (Req 5.1, 5.2, 5.3).
 *
 * Req 5.1 — aggregates revenue/COGS/expenses/net profit from transactions
 *   filtered to the requested period.
 * Req 5.2 — combines cash/bank balances, READY inventory value and agent
 *   receivable/deposit positions into the total asset figure.
 * Req 5.3 — any underlying fetch error propagates to the caller (no catch),
 *   matching the existing thrown-error pattern across the service layer.
 *
 * Data is fetched in parallel where possible; agent breakdowns are likewise
 * resolved in parallel, one transaction query per agent.
 */
export async function getFinanceSummary(
  period?: FinancePeriodInput,
  options: FinanceSummaryOptions = {},
): Promise<FinanceSummary> {
  const p: FinancePeriod = { from: period?.from ?? null, to: period?.to ?? null };
  const includeAgentMoney = options.includeAgentMoney ?? true;

  const [transactions, accounts, stockItems] = await Promise.all([
    getTransactions(),
    getAccounts(),
    getStockItems(),
  ]);

  const cashBankTotal = accounts.reduce(
    (sum, a) => sum + (a.current_balance ?? 0),
    0,
  );

  const breakdowns = includeAgentMoney
    ? await getAgents().then((agents) =>
        Promise.all(
          agents.map((a) =>
            getAgentTransactions(a.id).then((txs) => getAgentBalanceBreakdown(txs)),
          ),
        ),
      )
    : [];

  const agentReceivable = breakdowns.reduce(
    (sum, b) => sum + b.outstandingDebt,
    0,
  );
  const agentDepositLiability = breakdowns.reduce(
    (sum, b) => sum + b.depositCredit,
    0,
  );

  return buildFinanceSummary({
    period: p,
    transactions,
    stockItems,
    cashBankTotal,
    agentReceivable,
    agentDepositLiability,
  });
}
