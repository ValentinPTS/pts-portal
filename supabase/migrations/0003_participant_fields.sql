-- Registration fields used by the List of Registered Participants (PTS-L 4.4-1):
-- delivery address for the PT items, and how many times the lab has participated.
-- Safe to run more than once.
alter table participants
  add column if not exists delivery_address text,
  add column if not exists participations integer;
