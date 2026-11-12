ALTER TABLE videos ADD COLUMN needs_classification INTEGER NOT NULL DEFAULT 0 CHECK(needs_classification IN (0,1));
CREATE INDEX videos_classification ON videos(user_id,needs_classification,next_attempt_at);
