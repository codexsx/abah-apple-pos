import { supabase } from '@/lib/supabase';
import { deriveAgentBalanceBreakdown, type AgentBalanceBreakdown } from '@/services/depositCore';

export interface Agent {
  id: string;
  code: string;
  name: string;
  phone: string;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface AgentInsert {
  id?: string;
  code: string;
  name: string;
  phone?: string;
  note?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AgentUpdate {
  code?: string;
  name?: string;
  phone?: string;
  note?: string;
  updated_at?: string;
}

export interface AgentTransaction {
  id: string;
  agent_id: string;
  type: 'Stor/Bayar' | 'Koreksi' | 'Penyesuaian';
  amount: number;
  method: 'Cash' | 'Transfer' | 'Hutang';
  note: string;
  created_at: string;
}

export interface AgentTransactionInsert {
  agent_id: string;
  type: 'Stor/Bayar' | 'Koreksi' | 'Penyesuaian';
  amount: number;
  method?: 'Cash' | 'Transfer' | 'Hutang';
  note?: string;
  created_at?: string;
}

export async function getAgents(): Promise<Agent[]> {
  const { data, error } = await supabase.from('agents').select('*').order('code', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getAgentById(id: string): Promise<Agent | null> {
  const { data, error } = await supabase.from('agents').select('*').eq('id', id).single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

export async function createAgent(agent: AgentInsert): Promise<Agent> {
  const { data, error } = await supabase.from('agents').insert(agent).select().single();
  if (error) throw error;
  if (!data) throw new Error('Failed to create agent');
  return data;
}

export async function updateAgent(id: string, agent: AgentUpdate): Promise<Agent> {
  const { data, error } = await supabase.from('agents').update(agent).eq('id', id).select().single();
  if (error) throw error;
  if (!data) throw new Error('Failed to update agent');
  return data;
}

export async function deleteAgent(id: string): Promise<void> {
  const { error } = await supabase.from('agents').delete().eq('id', id);
  if (error) throw error;
}

export async function getAgentTransactions(agentId?: string): Promise<AgentTransaction[]> {
  let query = supabase.from('agent_transactions').select('*').order('created_at', { ascending: false });
  if (agentId) {
    query = query.eq('agent_id', agentId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createAgentTransaction(tx: AgentTransactionInsert): Promise<AgentTransaction> {
  const { data, error } = await supabase.from('agent_transactions').insert(tx).select().single();
  if (error) throw error;
  if (!data) throw new Error('Failed to create agent transaction');
  return data;
}

export async function deleteAgentTransaction(id: string): Promise<void> {
  const { error } = await supabase.from('agent_transactions').delete().eq('id', id);
  if (error) throw error;
}

export function getAgentBalance(transactions: AgentTransaction[]): number {
  let debt = 0; // Koreksi + Penyesuaian = money owed by agent
  let paid = 0; // Stor/Bayar = money paid back by agent

  for (const tx of transactions) {
    if (tx.type === 'Stor/Bayar') {
      paid += tx.amount || 0;
    } else {
      // Koreksi and Penyesuaian increase debt
      debt += tx.amount || 0;
    }
  }

  return debt - paid; // Positive = agent owes the shop, Negative = Kelebihan Bayar
}

/**
 * Decompose an agent's transactions into outstanding debt vs deposit credit
 * (Req 2.1, 2.2). Reuses the SAME debt/paid summation as getAgentBalance
 * (debt = Koreksi + Penyesuaian; paid = Stor/Bayar), then delegates to the
 * pure deriveAgentBalanceBreakdown core.
 */
export function getAgentBalanceBreakdown(transactions: AgentTransaction[]): AgentBalanceBreakdown {
  let debt = 0; // Koreksi + Penyesuaian = money owed by agent
  let paid = 0; // Stor/Bayar = money paid back by agent

  for (const tx of transactions) {
    if (tx.type === 'Stor/Bayar') {
      paid += tx.amount || 0;
    } else {
      // Koreksi and Penyesuaian increase debt
      debt += tx.amount || 0;
    }
  }

  return deriveAgentBalanceBreakdown(debt, paid);
}

export function formatAgentPhone(phone: string | null): string {
  if (!phone) return '-';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length >= 10 && cleaned.startsWith('62')) {
    return '+' + cleaned.replace(/(\d{2})(\d{3})(\d{4})(\d+)/, '$1 $2 $3 $4');
  }
  if (cleaned.length >= 10 && cleaned.startsWith('0')) {
    return cleaned.replace(/(\d{4})(\d{4})(\d+)/, '$1-$2-$3');
  }
  return phone;
}
