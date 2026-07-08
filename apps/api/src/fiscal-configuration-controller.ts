import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  isValidSpanishNifNie,
  normalizeSpanishTaxId,
} from '@anclora/core';
import { encryptTaxIdentity } from '@anclora/core/server';
import { z } from 'zod';

const payloadSchema = z.object({
  legalEntity: z.object({
    legalName: z.string().trim().min(1),
    tradeName: z.string().trim().optional().nullable(),
    countryCode: z.string().trim().length(2),
    currencyCode: z.string().trim().length(3),
    address: z.string().trim().min(1),
    contactEmail: z.string().email().optional().nullable(),
  }),
  series: z.object({ code: z.string().trim().min(1), fiscalYear: z.number().int().min(2020), documentType: z.string().trim().min(1) }),
  productProfile: z.object({ selector: z.string().trim().min(1), productNature: z.string().trim().min(1), invoiceDescription: z.string().trim().min(1), domesticTaxCode: z.string().trim().min(1), domesticTaxRate: z.string().regex(/^\d+(\.\d{1,6})?$/), ossEligible: z.boolean(), shippingRequired: z.boolean(), effectiveFrom: z.string().date() }),
  kdpPolicy: z.object({ version: z.string().trim().min(1), effectiveFrom: z.string().date(), accountingPolicy: z.enum(['NET_ROYALTY_ONLY', 'GROSS_AND_COST_REVIEW_REQUIRED']), embeddedCostTreatment: z.string().trim().min(1), reviewLevel: z.string().trim().min(1) }),
});

const fiscalIssuerPayloadSchema = z.object({
  datosEmisor: z.object({
    tipoEmisor: z.literal('PERSONA_FISICA'),
    nombreLegal: z.string().trim().min(1),
    nombreComercial: z.string().trim().optional().nullable(),
    pais: z.string().trim().length(2).default('ES'),
    moneda: z.string().trim().length(3).default('EUR'),
    direccionFiscal: z.string().trim().min(1),
    emailContacto: z.string().email().optional().nullable(),
    nifNie: z.string().trim().optional().nullable(),
    epigrafeIAE: z.string().trim().min(1),
    regimenIVA: z.literal('REGIMEN_REDUCIDO_LIBROS_ES'),
  }),
  oss: z.object({
    activo: z.boolean(),
    vigenteDesde: z.string().date().optional().nullable(),
  }),
  perfilProducto: z.object({
    selector: z.string().trim().min(1),
    naturalezaProducto: z.string().trim().min(1),
    descripcionFactura: z.string().trim().min(1),
    codigoIVA: z.string().trim().min(1),
    tipoIVA: z.string().regex(/^\d+(\.\d{1,6})?$/),
    elegibleOSS: z.boolean(),
    requiereEnvio: z.boolean(),
    vigenteDesde: z.string().date(),
  }),
  ejercicio: z.number().int().min(2020),
}).superRefine((payload, context) => {
  if (payload.datosEmisor.nifNie && !isValidSpanishNifNie(payload.datosEmisor.nifNie)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['datosEmisor', 'nifNie'],
      message: 'NIF/NIE no válido',
    });
  }
});

export type FiscalConfigurationPayload = z.infer<typeof payloadSchema>;
export type FiscalIssuerConfigurationPayload = z.infer<typeof fiscalIssuerPayloadSchema>;
export interface FiscalConfigurationRepositoryPort {
  get(tenantId: string): Promise<unknown>;
  saveMinimum(input: FiscalConfigurationPayload & { tenantId: string; actorId: string | null }): Promise<unknown>;
  saveIssuerConfiguration?(input: Omit<FiscalIssuerConfigurationPayload, 'datosEmisor'> & {
    tenantId: string;
    actorId: string | null;
    datosEmisor: Omit<FiscalIssuerConfigurationPayload['datosEmisor'], 'nifNie'> & { nifCifrado?: string | null };
  }): Promise<unknown>;
}

function redactEncryptedFields(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const snapshot = value as { legalEntity?: Record<string, unknown> | null };
  if (!snapshot.legalEntity) return value;
  const { taxIdentityEncrypted: _taxIdentityEncrypted, ...legalEntity } = snapshot.legalEntity;
  return { ...snapshot, legalEntity: { ...legalEntity, taxIdentityConfigured: Boolean(_taxIdentityEncrypted) } };
}

export function createFiscalConfigurationGetHandler(repository?: FiscalConfigurationRepositoryPort) {
  return async function fiscalConfigurationGetHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = request.authSession?.tenantId;
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Debe iniciar sesión' });
    if (!repository) return reply.code(503).send({ code: 'FISCAL_CONFIGURATION_UNAVAILABLE', message: 'La configuración fiscal no está disponible' });
    return redactEncryptedFields(await repository.get(tenantId));
  };
}

export function createFiscalConfigurationPutHandler(repository?: FiscalConfigurationRepositoryPort) {
  return async function fiscalConfigurationPutHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = request.authSession?.tenantId;
    const actorId = request.authSession?.actorId;
    if (!tenantId || !actorId) return reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Debe iniciar sesión' });
    if (request.body && typeof request.body === 'object' && 'datosEmisor' in request.body) {
      const parsed = fiscalIssuerPayloadSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ code: 'CONFIGURACION_FISCAL_INVALIDA', message: 'Revise los campos obligatorios', issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) });
      if (!repository?.saveIssuerConfiguration) return reply.code(503).send({ code: 'CONFIGURACION_FISCAL_NO_DISPONIBLE', message: 'La configuración fiscal del emisor no está disponible' });
      const { nifNie: rawTaxIdentity, ...datosEmisor } = parsed.data.datosEmisor;
      const nifCifrado = rawTaxIdentity ? encryptTaxIdentity(normalizeSpanishTaxId(rawTaxIdentity)) : undefined;
      return redactEncryptedFields(await repository.saveIssuerConfiguration({
        ...parsed.data,
        tenantId,
        actorId,
        datosEmisor: { ...datosEmisor, ...(nifCifrado ? { nifCifrado } : {}) },
      }));
    }
    const parsed = payloadSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: 'INVALID_FISCAL_CONFIGURATION', message: 'Revise los campos obligatorios', issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) });
    if (!repository) return reply.code(503).send({ code: 'FISCAL_CONFIGURATION_UNAVAILABLE', message: 'La configuración fiscal no está disponible' });
    return redactEncryptedFields(await repository.saveMinimum({ ...parsed.data, tenantId, actorId }));
  };
}
