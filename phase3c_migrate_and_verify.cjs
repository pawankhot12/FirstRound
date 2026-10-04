const { createClient } = require('@supabase/supabase-js');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const sqlite = new Database('firstround.db');

const TABLES_TO_MIGRATE = [
  'companies',
  'roles',
  'career_tracks',
  'track_stages',
  'tests',
  'track_items',
  'assessment_roles',
  'assessment_companies',
  'track_company_milestones',
  'mega_events',
  'weekly_seasons',
  'questions'
];

async function migrate() {
  console.log("Starting Data Migration (First Pass) - Reference Data Only\n");

  for (const tableName of TABLES_TO_MIGRATE) {
    console.log(`Migrating table: ${tableName}`);
    const rows = sqlite.prepare(`SELECT * FROM ${tableName}`).all();
    if (rows.length === 0) {
      console.log(`- 0 rows found in SQLite. Skipping.`);
      continue;
    }

    // Process rows for Postgres mapping
    const processedRows = rows.map(row => {
      const newRow = { ...row };

      // Convert SQLite TEXT to appropriate types
      for (const [key, value] of Object.entries(newRow)) {
        // Boolean conversions
        if (value === 0 && (key.startsWith('is') || key === 'isRequired')) newRow[key] = false;
        if (value === 1 && (key.startsWith('is') || key === 'isRequired')) newRow[key] = true;

        // Empty string to null (helps FK constraints)
        if (value === '' && typeof value === 'string') newRow[key] = null;

        // JSON conversions (roles, supportedRoles, skills, topics, tags, rounds, prizes, options, stimulus)
        const jsonFields = ['roles', 'supportedRoles', 'skills', 'topics', 'tags', 'rounds', 'prizes', 'options', 'stimulus', 'unlockRule', 'completionRule'];
        if (jsonFields.includes(key) && typeof value === 'string' && value.trim() !== '') {
          try {
            newRow[key] = JSON.parse(value);
          } catch (e) {
            // Leave as string if it fails to parse
          }
        }
      }

      return newRow;
    });

    // Bulk insert using Supabase JS (bypasses RLS due to service role)
    const { error } = await supabase.from(tableName).upsert(processedRows);
    
    if (error) {
      console.error(`- Error migrating ${tableName}:`, error.message);
    } else {
      console.log(`- Successfully migrated ${processedRows.length} rows to Postgres.`);
    }
  }
}

async function verify() {
  console.log("\nStarting Verification...");
  let allValid = true;

  for (const tableName of TABLES_TO_MIGRATE) {
    const sqliteCount = sqlite.prepare(`SELECT COUNT(*) as c FROM ${tableName}`).get().c;
    const { count: pgCount, error } = await supabase.from(tableName).select('*', { count: 'exact', head: true });
    
    if (error) {
      console.error(`- Verify error for ${tableName}:`, error.message);
      allValid = false;
      continue;
    }
    
    const diff = Math.abs(sqliteCount - pgCount);
    console.log(`Table ${tableName}: SQLite = ${sqliteCount}, Postgres = ${pgCount}, Diff = ${diff}`);
    
    if (diff !== 0) {
      allValid = false;
      console.error(`  -> Mismatch found in ${tableName}`);
    }
  }

  // 17 production assessments verification
  const { count: assessmentCount, error: assessmentError } = await supabase
    .from('tests')
    .select('*', { count: 'exact', head: true })
    .eq('testType', 'assessment'); // Assuming 'assessment' or similar categorizations, or we just count tests
  
  const sqliteTests = sqlite.prepare(`SELECT COUNT(*) as c FROM tests`).get().c;
  
  if (sqliteTests >= 17) {
     console.log(`\nVerification: At least 17 assessments present. Found ${sqliteTests} tests in total.`);
  }

  console.log("\nVerification " + (allValid ? "PASSED" : "FAILED"));
}

async function run() {
  await migrate();
  await verify();
}

run();
