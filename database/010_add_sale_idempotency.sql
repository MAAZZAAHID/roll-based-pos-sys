-- Migration 010: Add shop-scoped sale idempotency metadata.

BEGIN;

ALTER TABLE sales
  ADD COLUMN idempotency_key VARCHAR(255),
  ADD COLUMN idempotency_request_hash CHAR(64);

ALTER TABLE sales
  ADD CONSTRAINT sales_idempotency_metadata_check
  CHECK (
    (idempotency_key IS NULL AND idempotency_request_hash IS NULL)
    OR (
      idempotency_key IS NOT NULL
      AND length(btrim(idempotency_key)) > 0
      AND length(idempotency_key) <= 255
      AND idempotency_request_hash IS NOT NULL
      AND length(btrim(idempotency_request_hash)) = 64
      AND btrim(idempotency_request_hash) ~ '^[0-9a-f]{64}$'
    )
  );

CREATE UNIQUE INDEX uq_sales_shop_idempotency_key
  ON sales (shop_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMIT;
