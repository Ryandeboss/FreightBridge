alter table if exists midwest_sim.inbound_edi_documents
  add column if not exists transport text not null default 'REST',
  add column if not exists source_filename text,
  add column if not exists source_path text,
  add column if not exists archive_path text,
  add column if not exists error_path text;

alter table if exists midwest_sim.inbound_edi_documents
  drop constraint if exists midwest_inbound_edi_transport_check;

alter table if exists midwest_sim.inbound_edi_documents
  add constraint midwest_inbound_edi_transport_check check (transport in ('REST', 'SFTP'));

alter table if exists midwest_sim.outbound_edi_documents
  add column if not exists transport text,
  add column if not exists remote_filename text,
  add column if not exists remote_path text;

alter table if exists midwest_sim.outbound_edi_documents
  drop constraint if exists midwest_outbound_edi_transport_check;

alter table if exists midwest_sim.outbound_edi_documents
  add constraint midwest_outbound_edi_transport_check check (
    transport is null or transport in ('REST', 'SFTP')
  );

create index if not exists idx_midwest_inbound_edi_transport
  on midwest_sim.inbound_edi_documents (transport);

create index if not exists idx_midwest_outbound_edi_transport
  on midwest_sim.outbound_edi_documents (transport);
