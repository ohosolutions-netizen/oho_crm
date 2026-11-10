const norm=value=>String(value??'').trim().toLowerCase();

export function isActiveSyncOwner(user,row={}){
 const value=user?.active??row.Active;
 return value===true||value===1||['1','true','active','yes'].includes(norm(value));
}

export function resolveFallbackOwner(users,configuredValue=''){
 const configured=norm(configuredValue);
 const fields=user=>[user?.id,user?.email,user?.auth_id,user?.name].map(norm);
 if(configured){
  const configuredOwner=users.find(user=>fields(user).includes(configured));
  if(configuredOwner)return configuredOwner;
 }
 return users.find(user=>norm(user?.email)==='c8tyvch5hn@privaterelay.appleid.com')
  ||users.find(user=>norm(user?.email).endsWith('@ohosolutions.in'))
  ||users[0];
}
