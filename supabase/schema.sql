create extension if not exists pgcrypto;

create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    full_name text not null default '',
    phone text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.bookings (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    first_name text not null,
    surname text not null,
    email text not null,
    phone text not null,
    experience text not null check (experience in ('PC GAMING', 'CONSOLE GAMING', 'ESPORTS ARENA')),
    players integer not null check (players between 1 and 20),
    hours integer not null check (hours between 1 and 8),
    extras jsonb not null default '[]'::jsonb,
    preferred_date date,
    preferred_time time,
    special_request text not null default '',
    booking_ref text,
    subtotal numeric(10, 2) not null check (subtotal >= 0),
    vat numeric(10, 2) not null check (vat >= 0),
    total numeric(10, 2) not null check (total >= 0),
    status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
    created_at timestamptz not null default now()
);

create table if not exists public.checkout_orders (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    booking_id uuid references public.bookings (id) on delete set null,
    order_type text not null check (order_type in ('booking', 'membership')),
    item text not null,
    amount numeric(10, 2) not null check (amount > 0),
    billing_period text,
    payment_method text not null default 'demo',
    status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
    created_at timestamptz not null default now()
);

create table if not exists public.membership_subscriptions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    order_id uuid not null unique references public.checkout_orders (id) on delete cascade,
    tier text not null,
    price numeric(10, 2) not null check (price > 0),
    billing_period text not null,
    status text not null default 'pending' check (status in ('pending', 'active', 'cancelled')),
    created_at timestamptz not null default now()
);

create table if not exists public.notifications (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    title text not null,
    message text not null,
    read_at timestamptz,
    created_at timestamptz not null default now()
);

create table if not exists public.contact_messages (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users (id) on delete set null,
    name text not null check (char_length(name) between 1 and 100),
    surname text not null check (char_length(surname) between 1 and 100),
    phone text not null check (char_length(phone) between 1 and 30),
    email text not null check (char_length(email) between 3 and 254),
    message text not null check (char_length(message) between 1 and 5000),
    created_at timestamptz not null default now()
);

create index if not exists bookings_user_created_idx on public.bookings (user_id, created_at desc);
create unique index if not exists bookings_booking_ref_unique_idx
    on public.bookings (booking_ref)
    where booking_ref is not null;
create index if not exists orders_user_created_idx on public.checkout_orders (user_id, created_at desc);
create index if not exists memberships_user_created_idx on public.membership_subscriptions (user_id, created_at desc);
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);

create or replace function public.set_booking_quote()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    base_rate numeric(10, 2);
    extras_total numeric(10, 2) := 0;
    extra jsonb;
begin
    base_rate := case new.experience
        when 'PC GAMING' then 80
        when 'CONSOLE GAMING' then 60
        when 'ESPORTS ARENA' then 120
    end;

    for extra in select value from jsonb_array_elements(new.extras)
    loop
        extras_total := extras_total + new.players * case extra ->> 'name'
            when 'Gamer Snack Pack & Energy Drink' then 65
            when 'VR Experience Access (COMING SOON Demo)' then 50
            when 'Tournament Pro Noise-Cancelling Headset' then 30
            when 'Private VIP Lounge Access' then 100
            else null
        end;
        if extras_total is null then
            raise exception 'Booking contains an unrecognized extra.';
        end if;
    end loop;

    new.subtotal := base_rate * new.players * new.hours + extras_total;
    new.vat := round(new.subtotal * 0.15, 2);
    new.total := new.subtotal + new.vat;
    new.status := 'pending';
    return new;
end;
$$;

drop trigger if exists set_booking_quote_before_insert on public.bookings;
create trigger set_booking_quote_before_insert
    before insert on public.bookings
    for each row execute procedure public.set_booking_quote();

create or replace function public.validate_checkout_order()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    booking_total numeric(10, 2);
    booking_experience text;
begin
    new.status := 'pending';
    new.payment_method := 'demo';

    if new.order_type = 'booking' then
        if new.booking_id is null then
            raise exception 'A saved booking is required for a booking order.';
        end if;
        select total, experience into booking_total, booking_experience
        from public.bookings
        where id = new.booking_id and user_id = new.user_id;
        if not found then
            raise exception 'Booking not found for this user.';
        end if;
        new.item := booking_experience || ' gaming session';
        new.amount := booking_total;
        new.billing_period := null;
    elsif new.order_type = 'membership' then
        if new.booking_id is not null then
            raise exception 'Membership orders cannot reference a booking.';
        end if;
        new.billing_period := 'Monthly';
        new.amount := case new.item
            when 'Bronze Pass Membership' then 99
            when 'Gold Pass Membership' then 199
            when 'Platinum Pass Membership' then 399
            else null
        end;
        if new.amount is null then
            raise exception 'Unrecognized membership plan.';
        end if;
    end if;

    return new;
end;
$$;

drop trigger if exists validate_checkout_order_before_insert on public.checkout_orders;
create trigger validate_checkout_order_before_insert
    before insert on public.checkout_orders
    for each row execute procedure public.validate_checkout_order();

alter table public.profiles enable row level security;
alter table public.bookings enable row level security;
alter table public.checkout_orders enable row level security;
alter table public.membership_subscriptions enable row level security;
alter table public.notifications enable row level security;
alter table public.contact_messages enable row level security;

grant select, update on public.profiles to authenticated;
grant select, insert on public.bookings to authenticated;
grant select, insert on public.checkout_orders to authenticated;
grant select on public.membership_subscriptions to authenticated;
grant select on public.notifications to authenticated;
grant insert on public.contact_messages to anon, authenticated;

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
    on public.profiles for select to authenticated
    using ((select auth.uid()) = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
    on public.profiles for update to authenticated
    using ((select auth.uid()) = id)
    with check ((select auth.uid()) = id);

drop policy if exists "Users can view their own bookings" on public.bookings;
create policy "Users can view their own bookings"
    on public.bookings for select to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own bookings" on public.bookings;
create policy "Users can create their own bookings"
    on public.bookings for insert to authenticated
    with check ((select auth.uid()) = user_id);

drop policy if exists "Users can view their own orders" on public.checkout_orders;
create policy "Users can view their own orders"
    on public.checkout_orders for select to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own orders" on public.checkout_orders;
create policy "Users can create their own orders"
    on public.checkout_orders for insert to authenticated
    with check (
        (select auth.uid()) = user_id
        and (
            booking_id is null
            or exists (
                select 1 from public.bookings
                where bookings.id = checkout_orders.booking_id
                  and bookings.user_id = (select auth.uid())
            )
        )
    );

drop policy if exists "Users can view their own memberships" on public.membership_subscriptions;
create policy "Users can view their own memberships"
    on public.membership_subscriptions for select to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can view their own notifications" on public.notifications;
create policy "Users can view their own notifications"
    on public.notifications for select to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can mark their own notifications read" on public.notifications;
create policy "Users can mark their own notifications read"
    on public.notifications for update to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

drop policy if exists "Anyone can submit a contact message" on public.contact_messages;
create policy "Anyone can submit a contact message"
    on public.contact_messages for insert to anon, authenticated
    with check (user_id is null or user_id = (select auth.uid()));

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id, full_name)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
    return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
    after insert on auth.users
    for each row execute procedure public.create_profile_for_new_user();

create or replace function public.notify_user_of_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.notifications (user_id, title, message)
    values (
        new.user_id,
        'BOOKING REQUEST RECEIVED',
        'Your ' || new.experience || ' booking request was saved for ' || new.players || ' player(s).'
    );
    return new;
end;
$$;

drop trigger if exists on_booking_created_notify_user on public.bookings;
create trigger on_booking_created_notify_user
    after insert on public.bookings
    for each row execute procedure public.notify_user_of_booking();

create or replace function public.notify_user_of_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.notifications (user_id, title, message)
    values (
        new.user_id,
        'ORDER RECEIVED',
        'Your order for ' || new.item || ' was saved with status ' || upper(new.status) || '.'
    );
    return new;
end;
$$;

drop trigger if exists on_order_created_notify_user on public.checkout_orders;
create trigger on_order_created_notify_user
    after insert on public.checkout_orders
    for each row execute procedure public.notify_user_of_order();

create or replace function public.create_membership_from_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.order_type = 'membership' then
        insert into public.membership_subscriptions (user_id, order_id, tier, price, billing_period)
        values (new.user_id, new.id, new.item, new.amount, coalesce(new.billing_period, 'Monthly'));
    end if;
    return new;
end;
$$;

drop trigger if exists on_membership_order_created on public.checkout_orders;
create trigger on_membership_order_created
    after insert on public.checkout_orders
    for each row execute procedure public.create_membership_from_order();
