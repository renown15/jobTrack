-- 009_add_contact_document_join_table.sql
-- Migration: add contact_document join table to link documents directly to contacts

BEGIN;

CREATE TABLE IF NOT EXISTS public.contact_document (
    contact_document_id integer PRIMARY KEY DEFAULT nextval('public.document_documentid_seq'),
    contactid integer NOT NULL,
    documentid integer NOT NULL,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT contact_document_contactid_fkey FOREIGN KEY (contactid) REFERENCES public.contact(contactid) ON DELETE CASCADE,
    CONSTRAINT contact_document_documentid_fkey FOREIGN KEY (documentid) REFERENCES public.document(documentid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_contact_document_contactid ON public.contact_document USING btree (contactid);
CREATE INDEX IF NOT EXISTS idx_contact_document_documentid ON public.contact_document USING btree (documentid);

INSERT INTO public.schema_migrations (version, filename)
VALUES (9, '009_add_contact_document_join_table.sql');

COMMIT;
