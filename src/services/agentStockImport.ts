import { readSheet } from 'read-excel-file/browser';

import { supabase } from '@/lib/supabase';
import type { StockStatus } from '@/services/stockCore';
import {
  parseAgentDefectStockRows,
  toAgentDefectImportPayloadRows,
  type AgentDefectImportPreview,
  type RawExcelRow,
} from '@/services/agentStockImportCore';

export interface ImportAgentDefectStockInput {
  agentId: string;
  fileName: string;
  preview: AgentDefectImportPreview;
}

export async function parseAgentDefectStockFile(
  file: File,
  defaultStatus: StockStatus = 'READY',
): Promise<AgentDefectImportPreview> {
  const rows = await readSheet(file);
  const rawRows: RawExcelRow[] = rows.map((values, index) => ({
    rowNumber: index + 1,
    values,
  }));

  return parseAgentDefectStockRows(rawRows, defaultStatus);
}

export async function importAgentDefectStock({
  agentId,
  fileName,
  preview,
}: ImportAgentDefectStockInput): Promise<string> {
  const payloadRows = toAgentDefectImportPayloadRows(preview.validRows);
  if (!agentId) {
    throw new Error('Agen wajib dipilih.');
  }
  if (payloadRows.length === 0) {
    throw new Error('Tidak ada baris valid untuk diimport.');
  }

  const { data, error } = await supabase.rpc('record_agent_defect_stock_import', {
    p_agent_id: agentId,
    p_file_name: fileName,
    p_rows: payloadRows,
    p_summary: {
      total_rows: preview.summary.totalRows,
      valid_rows: preview.summary.validRows,
      warning_rows: preview.summary.warningRows,
      error_rows: preview.summary.errorRows,
      total_cost: preview.summary.totalCost,
      imei_count: preview.summary.imeiCount,
      duplicate_imeis: preview.summary.duplicateImeis,
    },
  });

  if (error) throw error;
  if (!data) throw new Error('Import gagal: batch tidak terbentuk.');
  return data as string;
}
