import { SESSION_COOKIE, authenticate, revokeSession, requestPasswordReset, completePasswordReset, checkOrigin, errorResponse } from '../../../lib/server';
export const dynamic='force-dynamic';
function cookie(req:Request,token:string,maxAge:number) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(req.url).protocol==='https:'?'; Secure':''}`;
}
export async function POST(req:Request) {
  try {
    checkOrigin(req); const body=await req.json() as {action?:unknown;email?:unknown;password?:unknown;confirmPassword?:unknown;setup?:unknown;token?:unknown};
    if(body.action==='request-reset'){await requestPasswordReset(body.email,new URL(req.url).origin);return Response.json({ok:true,message:'If this is an active CRM account, a password reset link has been sent.'},{headers:{'Cache-Control':'no-store'}});}
    if(body.action==='reset-password'){await completePasswordReset(body.token,body.password,body.confirmPassword);return Response.json({ok:true,message:'Password updated. Sign in with your new password.'},{headers:{'Set-Cookie':cookie(req,'',0),'Cache-Control':'no-store'}});}
    const {me,token}=await authenticate(body.email,body.password,body.setup===true,body.confirmPassword);
    return Response.json({ok:true,email:me.email},{headers:{'Set-Cookie':cookie(req,token,60*60*24*30),'Cache-Control':'no-store'}});
  }catch(e){const response=errorResponse(e);if(response.status===409)return Response.json({error:'Create your password to activate this account.',setupRequired:true},{status:409,headers:{'Cache-Control':'no-store'}});return response;}
}
export async function DELETE(req:Request) {
  try {checkOrigin(req);const match=req.headers.get('cookie')?.match(/(?:^|;\s*)oho_crm_session=([^;]+)/);await revokeSession(match?.[1]);return Response.json({ok:true},{headers:{'Set-Cookie':cookie(req,'',0),'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}
}
