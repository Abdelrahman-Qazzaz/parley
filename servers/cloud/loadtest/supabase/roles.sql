-- The image creates Supabase's roles without passwords; Storage connects as
-- its own, so it needs one. Local only, like everything in this stack.
\set pgpass `echo "$POSTGRES_PASSWORD"`
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';
