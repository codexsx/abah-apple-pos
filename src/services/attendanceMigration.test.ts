import { describe, expect, it } from 'vitest';

import migrationSql from '../../supabase/migrations/20260702152618_attendance_off_requests.sql?raw';
import controlsMigrationSql from '../../supabase/migrations/20260705070013_attendance_search_controls.sql?raw';
import revisionMigrationSql from '../../supabase/migrations/20260705082945_attendance_revision_requests.sql?raw';
import managerRevisionMigrationSql from '../../supabase/migrations/20260705100643_allow_manager_attendance_revision_requests.sql?raw';

describe('attendance off request migration', () => {
  it('creates off requests with RLS and manager approval policy', () => {
    expect(migrationSql).toContain('create table if not exists public.attendance_off_requests');
    expect(migrationSql).toContain('constraint attendance_off_one_request_per_staff_date unique');
    expect(migrationSql).toContain('alter table public.attendance_off_requests enable row level security');
    expect(migrationSql).toContain('Managers review attendance off requests');
    expect(migrationSql).toContain("status in ('pending', 'approved', 'rejected')");
  });
});

describe('attendance search controls migration', () => {
  it('adds staff attendance activation, auto-off dates, and late reason support', () => {
    expect(controlsMigrationSql).toContain('add column if not exists attendance_required boolean not null default true');
    expect(controlsMigrationSql).toContain('add column if not exists late_reason text');
    expect(controlsMigrationSql).toContain('create table if not exists public.attendance_auto_off_dates');
    expect(controlsMigrationSql).toContain('alter table public.attendance_auto_off_dates enable row level security');
    expect(controlsMigrationSql).toContain('grant select, insert, update, delete on public.attendance_auto_off_dates to authenticated');
    expect(controlsMigrationSql).toContain('drop function if exists private.get_attendance_expected_staff()');
    expect(controlsMigrationSql).toContain('create or replace function public.set_staff_attendance_required');
    expect(controlsMigrationSql).toContain('coalesce(p.attendance_required, true) = true');
    expect(controlsMigrationSql).toContain('revoke all on function public.get_attendance_staff_directory() from public, anon, authenticated');
  });
});

describe('attendance revision request migration', () => {
  it('creates shift revision requests with RLS and manager approval RPC', () => {
    expect(revisionMigrationSql).toContain('create table if not exists public.attendance_revision_requests');
    expect(revisionMigrationSql).toContain('attendance_revision_one_pending_per_record');
    expect(revisionMigrationSql).toContain('alter table public.attendance_revision_requests enable row level security');
    expect(revisionMigrationSql).toContain('Users create own pending attendance revisions');
    expect(revisionMigrationSql).toContain('create or replace function public.review_attendance_revision_request');
    expect(revisionMigrationSql).toContain('update public.attendance_records');
    expect(revisionMigrationSql).toContain("p_status not in ('approved', 'rejected')");
    expect(revisionMigrationSql).toContain('r.id = attendance_revision_requests.attendance_record_id');
    expect(revisionMigrationSql).toContain('r.staff_id = attendance_revision_requests.staff_id');
    expect(revisionMigrationSql).toContain('and staff_id = v_request.staff_id');
  });

  it('allows managers to request shift revisions for staff records with audit ownership', () => {
    expect(managerRevisionMigrationSql).toContain('drop policy if exists "Users create own pending attendance revisions"');
    expect(managerRevisionMigrationSql).toContain("(select private.has_permission('manage_users'))");
    expect(managerRevisionMigrationSql).toContain('requested_by = (select auth.uid())');
    expect(managerRevisionMigrationSql).toContain('r.id = attendance_revision_requests.attendance_record_id');
    expect(managerRevisionMigrationSql).toContain('r.staff_id = attendance_revision_requests.staff_id');
  });
});
