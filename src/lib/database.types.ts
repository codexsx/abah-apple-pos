export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          name: string;
          role: 'MANAJER' | 'KASIR' | 'TEKNISI';
          initials: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name?: string;
          role?: 'MANAJER' | 'KASIR' | 'TEKNISI';
          initials?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          role?: 'MANAJER' | 'KASIR' | 'TEKNISI';
          initials?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      agents: {
        Row: {
          id: string;
          code: string;
          name: string;
          phone: string;
          note: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          phone?: string;
          note?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          phone?: string;
          note?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      agent_transactions: {
        Row: {
          id: string;
          agent_id: string;
          type: 'Stor/Bayar' | 'Koreksi' | 'Penyesuaian';
          amount: number;
          method: 'Cash' | 'Transfer' | 'Hutang';
          note: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          agent_id: string;
          type: 'Stor/Bayar' | 'Koreksi' | 'Penyesuaian';
          amount: number;
          method?: 'Cash' | 'Transfer' | 'Hutang';
          note?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          agent_id?: string;
          type?: 'Stor/Bayar' | 'Koreksi' | 'Penyesuaian';
          amount?: number;
          method?: 'Cash' | 'Transfer' | 'Hutang';
          note?: string;
          created_at?: string;
        };
      };
      stock_items: {
        Row: {
          id: string;
          model: string;
          capacity: string;
          condition: string;
          color: string;
          imei: string;
          count: number;
          price: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          model: string;
          capacity?: string;
          condition?: string;
          color?: string;
          imei?: string;
          count?: number;
          price?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          model?: string;
          capacity?: string;
          condition?: string;
          color?: string;
          imei?: string;
          count?: number;
          price?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      service_records: {
        Row: {
          id: string;
          customer_name: string;
          phone_model: string;
          capacity: string;
          condition: string;
          color: string;
          imei: string;
          battery_health: number;
          issue: string;
          additional_note: string;
          status: 'ANTRIAN' | 'PROSES' | 'SELESAI' | 'GAGAL';
          estimated_cost: number;
          dp: number;
          created_at: string;
          completed_at: string;
          technician: string;
          service_type: 'Customer' | 'Toko Sendiri' | 'Klaim Garansi';
          stk_id: string;
        };
        Insert: {
          id?: string;
          customer_name?: string;
          phone_model?: string;
          capacity?: string;
          condition?: string;
          color?: string;
          imei?: string;
          battery_health?: number;
          issue?: string;
          additional_note?: string;
          status?: 'ANTRIAN' | 'PROSES' | 'SELESAI' | 'GAGAL';
          estimated_cost?: number;
          dp?: number;
          created_at?: string;
          completed_at?: string;
          technician?: string;
          service_type?: 'Customer' | 'Toko Sendiri' | 'Klaim Garansi';
          stk_id?: string;
        };
        Update: {
          id?: string;
          customer_name?: string;
          phone_model?: string;
          capacity?: string;
          condition?: string;
          color?: string;
          imei?: string;
          battery_health?: number;
          issue?: string;
          additional_note?: string;
          status?: 'ANTRIAN' | 'PROSES' | 'SELESAI' | 'GAGAL';
          estimated_cost?: number;
          dp?: number;
          created_at?: string;
          completed_at?: string;
          technician?: string;
          service_type?: 'Customer' | 'Toko Sendiri' | 'Klaim Garansi';
          stk_id?: string;
        };
      };
      transactions: {
        Row: {
          id: string;
          type: 'Penjualan' | 'Pembelian' | 'Servis' | 'Pengeluaran' | 'Tukar Tambah';
          description: string;
          detail: string;
          amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          type: 'Penjualan' | 'Pembelian' | 'Servis' | 'Pengeluaran' | 'Tukar Tambah';
          description?: string;
          detail?: string;
          amount?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          type?: 'Penjualan' | 'Pembelian' | 'Servis' | 'Pengeluaran' | 'Tukar Tambah';
          description?: string;
          detail?: string;
          amount?: number;
          created_at?: string;
        };
      };
      accessory_stock: {
        Row: {
          id: string;
          name: string;
          category: 'charger' | 'tempered_glass' | 'case' | 'kotak' | 'paperbag';
          stock: number;
          status: 'AMAN' | 'MENIPIS' | 'HABIS';
        };
        Insert: {
          id?: string;
          name: string;
          category?: 'charger' | 'tempered_glass' | 'case' | 'kotak' | 'paperbag';
          stock?: number;
          status?: 'AMAN' | 'MENIPIS' | 'HABIS';
        };
        Update: {
          id?: string;
          name?: string;
          category?: 'charger' | 'tempered_glass' | 'case' | 'kotak' | 'paperbag';
          stock?: number;
          status?: 'AMAN' | 'MENIPIS' | 'HABIS';
        };
      };
    };
  };
};
