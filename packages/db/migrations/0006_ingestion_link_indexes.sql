CREATE INDEX "commercial_orders_tenant_checkout_idx" ON "commercial_orders"("tenant_id","checkout_reference");
CREATE INDEX "financial_events_tenant_checkout_idx" ON "financial_events"("tenant_id","checkout_reference");
