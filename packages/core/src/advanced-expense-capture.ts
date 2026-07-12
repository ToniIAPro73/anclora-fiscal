export interface EvidenceProvenance{source:'MAILBOX'|'OCR'|'BANK';capturedAt:string;originalHash:string;extractorVersion:string;confidence:number;humanReviewStatus:'PENDING'|'APPROVED'|'REJECTED'}
export interface ExtractedExpenseField{name:string;value:string;confidence:number;boundingBox?:{page:number;x:number;y:number;width:number;height:number}}
export interface ExpenseCaptureResult{originalBytes:Uint8Array;mimeType:string;fields:ExtractedExpenseField[];provenance:EvidenceProvenance}
export interface MailboxExpensesEvidenceSource{fetchCandidates(input:{tenantId:string;cursor?:string}):Promise<ExpenseCaptureResult[]>}
export interface OcrExpensesEvidenceSource{extract(input:{tenantId:string;bytes:Uint8Array;mimeType:string}):Promise<ExpenseCaptureResult>}
export interface BankExpenseEvidenceSource{listTransactions(input:{tenantId:string;dateFrom:string;dateTo:string}):Promise<Array<{externalId:string;occurredAt:string;amount:number;currency:string;rawEvidenceHash:string;confidence:number}>>}
