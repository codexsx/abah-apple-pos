import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { getAgentBalance, type AgentTransaction } from '@/services/agents';

// Shared generators -------------------------------------------------------

/** One of the three canonical agent transaction types. */
const txType = fc.constantFrom<AgentTransaction['type']>(
  'Stor/Bayar',
  'Koreksi',
  'Penyesuaian',
);

/** Non-negative integer IDR amount in the inclusive domain 0 … 999,999,999,999. */
const amount = fc.integer({ min: 0, max: 999_999_999_999 });

/** Generator for a single AgentTransaction with all required fields. */
const agentTransaction: fc.Arbitrary<AgentTransaction> = fc.record({
  id: fc.uuid(),
  agent_id: fc.uuid(),
  type: txType,
  amount,
  method: fc.constantFrom<AgentTransaction['method']>('Cash', 'Transfer', 'Hutang'),
  note: fc.string(),
  created_at: fc.date({ noInvalidDate: true }).map((d) => d.toISOString()),
});

// Tests -------------------------------------------------------------------

describe('getAgentBalance', () => {
  // Feature: phase0-critical-bugfixes, Property 3: Balance formula correctness
  // Validates: Requirements 2.1
  it('equals sum(Koreksi + Penyesuaian) - sum(Stor/Bayar) for any transaction array', () => {
    fc.assert(
      fc.property(fc.array(agentTransaction), (txs) => {
        const debt = txs
          .filter((tx) => tx.type === 'Koreksi' || tx.type === 'Penyesuaian')
          .reduce((sum, tx) => sum + tx.amount, 0);
        const paid = txs
          .filter((tx) => tx.type === 'Stor/Bayar')
          .reduce((sum, tx) => sum + tx.amount, 0);

        expect(getAgentBalance(txs)).toBe(debt - paid);
      }),
      { numRuns: 100 },
    );
  });
});
