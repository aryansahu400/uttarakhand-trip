-- Riya, Rashi and Amisha joined after the first expenses were recorded. An empty split list means
-- "everyone", which used to be the original seven people, so spell those seven names out: every
-- existing expense keeps exactly the split it had. The app has always saved the names explicitly,
-- so this normally changes nothing; it only guards rows added some other way.
UPDATE "expenses"
SET "split_among" = '["Aryan","Krish","Tejas","Anshul","Shlok","Sarthak","Krishnam"]'::jsonb
WHERE "type" = 'trip' AND "split_among" = '[]'::jsonb;
