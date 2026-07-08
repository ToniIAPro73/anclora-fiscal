export interface EvidenciaPagoShopify {
  kind?: string | null;
  status?: string | null;
}

const TIPOS_COBRO_CONFIRMADO = new Set(['sale', 'capture']);
const ESTADOS_COBRO_CONFIRMADO = new Set(['success', 'succeeded']);

export function esCobroShopifyConfirmado(evento: EvidenciaPagoShopify): boolean {
  const tipo = (evento.kind ?? '').trim().toLowerCase();
  const estado = (evento.status ?? '').trim().toLowerCase();

  return TIPOS_COBRO_CONFIRMADO.has(tipo)
    && ESTADOS_COBRO_CONFIRMADO.has(estado);
}

export function hayCobroShopifyConfirmado(
  eventos: readonly EvidenciaPagoShopify[],
): boolean {
  return eventos.some(esCobroShopifyConfirmado);
}