-- Riepilogo della dashboard su un periodo scelto dall'admin (7 giorni … 24 mesi).
-- Migration additiva: admin_dashboard_stats() resta invariata per i contatori generali.
--
-- Il periodo comprende gli ultimi p_days giorni di calendario (fuso Europe/Rome), oggi incluso.
-- La serie del grafico usa giorni fino a 31 giorni, settimane fino a 6 mesi, mesi oltre.

create or replace function public.admin_dashboard_period(p_days integer)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_today  date := (now() at time zone 'Europe/Rome')::date;
  v_from   date;
  v_bucket text;
  v_step   interval;
  v        jsonb;
begin
  perform public.assert_admin();
  if p_days is null or p_days < 1 or p_days > 1095 then
    raise exception 'invalid_period' using errcode = '22023';
  end if;
  v_from := v_today - (p_days - 1);
  v_bucket := case when p_days <= 31 then 'day' when p_days <= 186 then 'week' else 'month' end;
  v_step := ('1 ' || v_bucket)::interval;

  with period_orders as (
    select o.id, o.total, o.status_id, (o.created_at at time zone 'Europe/Rome') as local_at
    from orders o
    where o.kind = 'order' and (o.created_at at time zone 'Europe/Rome')::date >= v_from
  )
  select jsonb_build_object(
    'days', p_days,
    'from', v_from,
    'to', v_today,
    'bucket', v_bucket,
    'orders', (select count(*) from period_orders),
    'revenue', (select coalesce(sum(po.total), 0) from period_orders po
                join order_statuses s on s.id = po.status_id where not s.is_cancelled),
    'orders_by_status', (
      select coalesce(jsonb_agg(jsonb_build_object('label', s.label, 'count', c.n) order by s.sort_order), '[]'::jsonb)
      from order_statuses s
      join lateral (select count(*) n from period_orders po where po.status_id = s.id) c on true
      where s.is_active
    ),
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object('start', b::date, 'count', (
        select count(*) from period_orders po where date_trunc(v_bucket, po.local_at) = b
      )) order by b), '[]'::jsonb)
      from generate_series(date_trunc(v_bucket, v_from::timestamp), date_trunc(v_bucket, v_today::timestamp), v_step) b
    )
  ) into v;
  return v;
end $$;

revoke all on function public.admin_dashboard_period(integer) from public, anon;
grant execute on function public.admin_dashboard_period(integer) to authenticated;
