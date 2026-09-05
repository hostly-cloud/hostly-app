import { auth } from "@/lib/firebase/client";
import type { CashWorkspaceSnapshot } from "@/lib/cash/types";

async function headers() { const user=auth.currentUser;if(!user)throw new Error("UNAUTHORIZED");return {"Content-Type":"application/json",Authorization:`Bearer ${await user.getIdToken()}`}; }
async function post(body:Record<string,unknown>){const response=await fetch("/api/cash",{method:"POST",headers:await headers(),body:JSON.stringify(body)});const payload=await response.json().catch(()=>null) as {ok?:boolean;error?:string;result?:unknown}|null;if(!response.ok||!payload?.ok)throw new Error(payload?.error||"CASH_OPERATION_FAILED");return payload;}
export async function requestCashWorkspace():Promise<CashWorkspaceSnapshot>{const response=await fetch("/api/cash",{headers:await headers(),cache:"no-store"});const payload=await response.json().catch(()=>null) as {ok?:boolean;error?:string;snapshot?:CashWorkspaceSnapshot}|null;if(!response.ok||!payload?.ok||!payload.snapshot)throw new Error(payload?.error||"CASH_WORKSPACE_FAILED");return payload.snapshot;}
export const requestOpenCashSession=(openingFloat:number)=>post({action:"session.open",openingFloat});
export const requestCashMovement=(input:{sessionId:string;type:"cash_in"|"cash_out";amount:number;reason:string})=>post({action:"movement.add",...input});
export const requestBlindCount=(sessionId:string,countedCash:number)=>post({action:"session.count",sessionId,countedCash});
export const requestReopenCashCount=(sessionId:string,reason:string)=>post({action:"session.reopen",sessionId,reason});
export const requestCloseCashSession=(sessionId:string,discrepancyReason:string)=>post({action:"session.close",sessionId,discrepancyReason});
export const requestCloseCashDay=(note:string)=>post({action:"day.close",note});
export async function downloadCashCsv(kind:"session"|"day",id:string){const response=await fetch(`/api/cash/export?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`,{headers:await headers(),cache:"no-store"});if(!response.ok){const p=await response.json().catch(()=>null) as {error?:string}|null;throw new Error(p?.error||"CASH_EXPORT_FAILED");}const blob=await response.blob(),url=URL.createObjectURL(blob);try{const disposition=response.headers.get("Content-Disposition")||"",match=disposition.match(/filename="?([^";]+)"?/i),a=document.createElement("a");a.href=url;a.download=match?.[1]||`hostly-${kind}-${id}.csv`;a.click();}finally{URL.revokeObjectURL(url);}}
