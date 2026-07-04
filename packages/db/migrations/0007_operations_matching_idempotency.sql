CREATE UNIQUE INDEX "canonical_operations_tenant_source_uq" ON "canonical_operations"("tenant_id","source_channel","source_order_id");
CREATE UNIQUE INDEX "matching_candidates_tenant_order_event_uq" ON "matching_candidates"("tenant_id","commercial_order_id","financial_event_id");
