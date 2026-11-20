-- One row per UTC day per tool; n = tool calls admitted that day.
CREATE TABLE IF NOT EXISTS calls (
  day  TEXT NOT NULL,
  tool TEXT NOT NULL,
  n    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, tool)
);
