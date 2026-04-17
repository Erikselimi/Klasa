create table if not exists public.class_portal_state (
  id integer primary key default 1,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.class_portal_state (id, state)
values (
  1,
  '{
    "profiles": [],
    "schedule": {
      "monday": "Matematikë, Gjuhë shqipe",
      "tuesday": "Histori, Biologji",
      "wednesday": "Fizikë, Anglisht, Informatikë",
      "thursday": "Kimi, Gjeografi",
      "friday": "Art, Edukim fizik, Këshillim klase"
    },
    "chat": [],
    "history": [],
    "shop": [
      {"id":"lucky_ticket","name":"Biletë me Fat","price":25,"effectLabel":"Shton fat","description":"Një shans për të rritur fitimin në lojën tjetër."},
      {"id":"shield","name":"Mbrojtje","price":40,"effectLabel":"Mbron humbjen","description":"Mbron nga humbja e parë në një duel ose bet."},
      {"id":"double","name":"Double Up","price":30,"effectLabel":"Dyfishon fitimin","description":"Dyfishon fitimin në një fitore të ardhshme."}
    ],
    "creatorActive": false
  }'::jsonb
)
on conflict (id) do nothing;
