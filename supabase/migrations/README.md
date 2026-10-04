# Supabase PostgreSQL Migration Strategy

This directory contains the versioned SQL migrations required to move FirstRound from a local SQLite database to Supabase PostgreSQL.

## File: `001_initial_schema.sql`

This is the primary migration script generated from the Phase 3A schema audit. It contains all 22 core application tables, indexes, references, and Row Level Security (RLS) policies.

### Important Notes
- **Semantic IDs**: Semantic string IDs (like `cat_foundation_quant` for tests) are intentionally preserved as `VARCHAR` primary keys.
- **Identity via Auth**: The `profiles` table replaces the SQLite `users` table. `profiles.id` uses `UUID` and directly references `auth.users(id)` ON DELETE CASCADE.
- **Data Protection**: The `questions` table is strictly protected by RLS and cannot be accessed via the public API (only the server with a Service Role key can access it).

### How to Apply Safely

1. **Prerequisites**: Ensure you have a Supabase project created and linked via the Supabase CLI.
2. **Review**: Manually review `001_initial_schema.sql` to ensure no unexpected changes are present.
3. **Execution**:
   Do NOT run this manually in the Supabase SQL Editor if you are using CLI migrations. 
   Instead, use the Supabase CLI to apply the migration to your local or remote database:
   ```bash
   # Apply to local Supabase instance
   npx supabase db push

   # OR apply to remote production instance
   npx supabase db push --linked
   ```
4. **Verification**: 
   - Open the Supabase Studio dashboard.
   - Verify that all 22 tables exist in the `public` schema.
   - Verify that the `profiles` table has a foreign key to `auth.users`.
   - Verify that RLS is active on all tables.

### Next Steps (Phase 3C)
Once the schema is applied, the next step is to export the existing SQLite data, transform the `users` data to align with `auth.users`, and seed it into the new Postgres schema.
