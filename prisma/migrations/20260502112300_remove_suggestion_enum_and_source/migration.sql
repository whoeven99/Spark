-- Drop source column from Suggestion
ALTER TABLE "Suggestion" DROP COLUMN "source";

-- Convert status from enum to text
ALTER TABLE "Suggestion" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Suggestion" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;
ALTER TABLE "Suggestion" ALTER COLUMN "status" SET DEFAULT 'NEW';

-- Remove old enum type
DROP TYPE "SuggestionStatus";
