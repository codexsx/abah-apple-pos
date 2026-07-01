// Feature: user-management
// Service layer for finance notifications (Phase 9): gather the live business
// snapshot (stock, accessories, accounts, agents, transactions) and delegate
// the pure alert derivation to the property-tested notificationsCore.
//
// Follows the service-layer thrown-error pattern: underlying fetch errors
// propagate (no catch).

import {
  countActionable,
  deriveNotifications,
  type NotificationItem,
} from '@/services/notificationsCore';
import { getStockItems, getAccessoryStock } from '@/services/stock';
import { getAccounts } from '@/services/accounts';
import {
  getAgents,
  getAgentTransactions,
  getAgentBalanceBreakdown,
} from '@/services/agents';
import { getTransactions } from '@/services/transactions';

const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface FinanceNotificationsResult {
  items: NotificationItem[];
  actionableCount: number;
}

export interface NotificationsOptions {
  includeAgentMoney?: boolean;
}

/**
 * Gather the live snapshot and derive the ordered notification list.
 * Throws on any underlying fetch error (no catch).
 */
export async function getNotifications(
  options: NotificationsOptions = {},
): Promise<NotificationItem[]> {
  const includeAgentMoney = options.includeAgentMoney ?? true;
  const [stock, accessories, accounts, agents, transactions] = await Promise.all([
    getStockItems(),
    getAccessoryStock(),
    getAccounts(),
    includeAgentMoney ? getAgents() : Promise.resolve([]),
    getTransactions(),
  ]);

  // For each agent, fetch their transactions and compute the outstanding debt.
  const agentLikes = includeAgentMoney
    ? await Promise.all(
        agents.map(async (agent) => {
          const txs = await getAgentTransactions(agent.id);
          const breakdown = getAgentBalanceBreakdown(txs);
          return { name: agent.name, outstandingDebt: breakdown.outstandingDebt };
        }),
      )
    : [];

  const cutoff = Date.now() - RECENT_WINDOW_MS;
  const recentTxCount = transactions.filter(
    (tx) => Date.parse(tx.created_at) >= cutoff,
  ).length;
  const lastTxAt = transactions.length > 0 ? transactions[0].created_at : null;

  return deriveNotifications({
    stock: stock.map((s) => ({ model: s.model, count: s.count, status: s.status })),
    accessories: accessories.map((a) => ({
      name: a.name,
      stock: a.stock,
      status: a.status,
    })),
    accounts: accounts.map((a) => ({
      name: a.name,
      current_balance: a.current_balance,
    })),
    agents: agentLikes,
    recentTxCount,
    lastTxAt,
  });
}

/**
 * Convenience variant returning the derived items alongside the actionable
 * count (severity !== 'info'). Throws on any underlying fetch error.
 */
export async function getNotificationsWithCount(
  options: NotificationsOptions = {},
): Promise<FinanceNotificationsResult> {
  const items = await getNotifications(options);
  return { items, actionableCount: countActionable(items) };
}
