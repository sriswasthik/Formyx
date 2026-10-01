-- AlterTable
ALTER TABLE "forms" ADD COLUMN     "published_theme" JSONB;

-- Themes move to the choices the design panel offers: fonts inter/serif/rounded, radius
-- sharp/rounded and background white/off_white/dark. The old default accent becomes the
-- Blue preset; other accents are kept.
UPDATE "forms"
SET "theme" = jsonb_strip_nulls(jsonb_build_object(
  'accentColor', CASE
    WHEN upper("theme"->>'accentColor') = '#2E5AAC' THEN '#4370BD'
    ELSE upper("theme"->>'accentColor')
  END,
  'font', CASE "theme"->>'font' WHEN 'serif' THEN 'serif' ELSE 'inter' END,
  'radius', CASE "theme"->>'radius' WHEN 'none' THEN 'sharp' ELSE 'rounded' END,
  'background', CASE
    WHEN "theme"->>'background' IN ('white', 'off_white', 'dark') THEN "theme"->>'background'
    WHEN upper("theme"->>'background') = '#FFFFFF' THEN 'white'
    -- Darker than mid-grey on average: dark; any other tint: off-white.
    WHEN ('x' || substr("theme"->>'background', 2, 2))::bit(8)::int
       + ('x' || substr("theme"->>'background', 4, 2))::bit(8)::int
       + ('x' || substr("theme"->>'background', 6, 2))::bit(8)::int < 384 THEN 'dark'
    ELSE 'off_white'
  END,
  'logoUrl', "theme"->'logoUrl',
  'coverUrl', "theme"->'coverUrl'
));

-- Published forms keep the look respondents already see.
UPDATE "forms" SET "published_theme" = "theme" WHERE "published_schema" IS NOT NULL;
