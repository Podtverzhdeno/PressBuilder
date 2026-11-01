/** Operator-managed music rights attestation only, not legal verification. */
export interface MusicRightsEvidence {
  verified:true;
  source:string;
  source_sha256:string;
  license_ref:string;
  attested_by:string;
  expires_at:string;
  note:string;
}
export interface MusicRightsVerifier {
  verify(projectId:string,music:{source_sha256:string;license_ref:string;licensed:boolean}):MusicRightsEvidence;
}
export function musicRightsVerifier(input:{
 catalogFile?:string;assetRoot?:string;projectRoot?:string;
 now?:()=>Date;
}):MusicRightsVerifier;
