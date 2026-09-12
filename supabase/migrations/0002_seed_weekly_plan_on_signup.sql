-- Seeds the starting rotation so a new account opens onto a populated Today
-- screen. Dollar-quoted so the apostrophes in the surah names need no escaping.
create or replace function public.seed_weekly_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.weekly_plan (user_id, weekday, sabqi, manzil, arabic) values
    (new.id, 1, $t$Al-Ahqaf$t$,
              $t$Adh-Dhariyat (tail, 51:31 on) - At-Tur - An-Najm$t$, $t$$t$),
    (new.id, 2, $t$Muhammad$t$,
              $t$Al-Qamar - Ar-Rahman - Al-Waqi'ah$t$, $t$$t$),
    (new.id, 3, $t$Al-Fath, Al-Hujurat$t$,
              $t$Al-Hadid - Al-Mujadila - Al-Hashr$t$, $t$$t$),
    (new.id, 4, $t$Qaf, Adh-Dhariyat (1-30)$t$,
              $t$Al-Mumtahanah - As-Saff - Al-Jumu'ah$t$, $t$$t$),
    (new.id, 5, $t$Fussilat (tail, 41:47-54), Ash-Shura$t$,
              $t$Al-Munafiqun - At-Taghabun - At-Talaq - At-Tahrim$t$, $t$$t$),
    (new.id, 6, $t$Az-Zukhraf$t$,
              $t$Al-Mulk - Al-Qalam - Al-Haqqah - Al-Ma'arij$t$, $t$$t$),
    (new.id, 7, $t$Ad-Dukhan$t$,
              $t$Nuh - Al-Jinn - Al-Muzzammil - Al-Muddaththir - Al-Qiyamah - Al-Insan - Al-Mursalat - Juz 30 (37 short surahs; heavy, may need splitting across two days)$t$, $t$$t$)
  on conflict (user_id, weekday) do nothing;
  return new;
end;
$fn$;

create trigger on_auth_user_created_seed_plan
  after insert on auth.users
  for each row execute function public.seed_weekly_plan();
