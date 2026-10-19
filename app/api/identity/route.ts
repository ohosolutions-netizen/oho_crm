import { EMAIL_COOKIE, context, checkOrigin, errorResponse, validEmail } from '../../../lib/server';
export const dynamic='force-dynamic';
function cookie(req:Request,email:string,maxAge:number) {
  return `${EMAIL_COOKIE}=${encodeURIComponent(email)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(req.url).protocol==='https:'?'; Secure':''}`;
}
export async function POST(req:Request) {
  try {
    checkOrigin(req); const body=await req.json() as {email?:unknown}; const email=typeof body.email==='string'&&/^[0-9a-f-]{36}$/i.test(body.email.trim())?body.email.trim():validEmail(body.email);
    const c=await context(email);
    return Response.json({ok:true,email:c.me.email},{headers:{'Set-Cookie':cookie(req,email,60*60*24*30),'Cache-Control':'no-store'}});
  }catch(e){return errorResponse(e);}
}
export async function DELETE(req:Request) {
  try {checkOrigin(req);return Response.json({ok:true},{headers:{'Set-Cookie':cookie(req,'',0),'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}
}
