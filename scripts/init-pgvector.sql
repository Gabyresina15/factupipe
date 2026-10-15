CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS invoice_embeddings (
  id            bigserial PRIMARY KEY,
  content_hash  text UNIQUE NOT NULL,
  invoice_id    text,
  text          text NOT NULL,
  embedding     vector(768),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_embeddings_embedding_idx
  ON invoice_embeddings
  USING hnsw (embedding vector_cosine_ops);
