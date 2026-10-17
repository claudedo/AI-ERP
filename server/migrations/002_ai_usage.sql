BEGIN;
CREATE TABLE IF NOT EXISTS ai_usage (
  day date NOT NULL,
  scope text NOT NULL,
  used integer NOT NULL CHECK(used > 0),
  PRIMARY KEY(day,scope)
);
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ai_usage FROM anon,authenticated;
INSERT INTO nodus_migrations(version) VALUES(2) ON CONFLICT DO NOTHING;
COMMIT;
