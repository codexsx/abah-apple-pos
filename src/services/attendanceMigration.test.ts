import { describe, expect, it } from 'vitest';

import migrationSql from '../../supabase/migrations/20260702152618_attendance_off_requests.sql?raw';

describe('attendance off request migration', () => {
  it('creates off requests with RLS and manager approval policy', () => {
    expect(migrationSql).toContain('create table if not exists public.attendance_off_requests');
    expect(migrationSql).toContain('constraint attendance_off_one_request_per_staff_date unique');
    expect(migrationSql).toContain('alter table public.attendance_off_requests enable row level security');
    expect(migrationSql).toContain('Managers review attendance off requests');
    expect(migrationSql).toContain("status in ('pending', 'approved', 'rejected')");
  });
});
