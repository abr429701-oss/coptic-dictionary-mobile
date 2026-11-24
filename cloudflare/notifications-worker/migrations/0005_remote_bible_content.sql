CREATE TABLE IF NOT EXISTS bible_verse_overrides (
  book_id INTEGER NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  language TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (book_id, chapter, verse, language)
);
CREATE INDEX IF NOT EXISTS idx_bible_overrides_book_chapter ON bible_verse_overrides(book_id, chapter, language);

CREATE TABLE IF NOT EXISTS bible_book_overrides (
  book_id INTEGER PRIMARY KEY,
  meta_json TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bible_edit_history (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('verses', 'book')),
  changes_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  undone_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_bible_history_created ON bible_edit_history(created_at DESC);
