-- Recovery: Skip the problematic ADD COLUMN since appName already exists
-- This migration does nothing but gets recorded as applied
-- The state is now consistent with schema

-- Verify table structure (these PRAGMAs don't modify data, just check)
PRAGMA table_info("Session");
