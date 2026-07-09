export const AEAT_VERIFACTU_NAMESPACES = {
  soapEnvelope: 'http://schemas.xmlsoap.org/soap/envelope/',
  suministroLR: 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd',
  suministroInformacion: 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd',
  respuestaSuministro: 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/RespuestaSuministro.xsd',
  consultaLR: 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/ConsultaLR.xsd',
  respuestaConsultaLR: 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/RespuestaConsultaLR.xsd',
  xmlDsig: 'http://www.w3.org/2000/09/xmldsig#',
} as const;

export const AEAT_VERIFACTU_XML_LIMITS = {
  maxRegistroFacturaPerEnvelope: 1000,
} as const;

export const AEAT_VERIFACTU_RESPONSE_STATUS = {
  envio: ['Correcto', 'ParcialmenteCorrecto', 'Incorrecto'],
  registro: ['Correcto', 'AceptadoConErrores', 'Incorrecto'],
} as const;
