-- Owner request (M3): add "wash" as a service type for bikes and cars.
alter table public.service_events drop constraint service_events_type_check;
alter table public.service_events add constraint service_events_type_check
  check (type in ('oil', 'filter', 'chain_oil', 'general_service', 'wash'));

alter table public.reminder_rules drop constraint reminder_rules_service_type_check;
alter table public.reminder_rules add constraint reminder_rules_service_type_check
  check (service_type in ('oil', 'filter', 'chain_oil', 'general_service', 'wash'));
