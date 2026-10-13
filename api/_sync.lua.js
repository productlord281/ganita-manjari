'use strict';
/* One Lua script does a whole room sync in a single Redis round trip:
   apply writes, record presence, return what changed. Rooms live under the prefix r:CODE: */
module.exports = `
local P=KEYS[1]
local q=cjson.decode(ARGV[1])
local now=tonumber(ARGV[2])
local TTL=tonumber(ARGV[3])
local TTLW=tonumber(ARGV[4])
local M=P..'meta'
if redis.call('EXISTS',M)==0 then
  if not q.create then return {0} end
end
if q.probe then
  return {1,redis.call('HGETALL',M)}
end
local changed=false
local check=false
for _,op in ipairs(q.ops or {}) do
  local t=op.t
  if t=='meta' then
    for i=1,#op.v,2 do
      redis.call('HSET',M,op.v[i],op.v[i+1])
      if op.v[i]=='won' and op.v[i+1]=='true' then check=true end
    end
    changed=true
  elseif t=='player' then
    if op.v then redis.call('HSET',P..'pl',op.k,op.v) else redis.call('HDEL',P..'pl',op.k); check=true end
    changed=true
  elseif t=='say' then
    redis.call('RPUSH',P..'chat',op.v)
    redis.call('LTRIM',P..'chat',-400,-1)
  elseif t=='sol' then
    redis.call('HSET',P..'sol',op.k,op.v)
    changed=true
  end
end
if changed then redis.call('INCR',P..'v') end
if check then
  local hero=false
  local hj=redis.call('HGET',M,'hero')
  if hj then local ok,h=pcall(cjson.decode,hj); if ok and type(h)=='table' then hero=h.k end end
  if redis.call('HGET',M,'won')=='true' then
    local ks=redis.call('HKEYS',P..'pl')
    local squad=0
    for i=1,#ks do if ks[i]~=hero then squad=squad+1 end end
    if squad==0 then
      redis.call('DEL',M,P..'pl',P..'on',P..'chat',P..'sol',P..'v')
      return {2}
    end
  end
end
if q.tab then
  if q.leave then redis.call('HDEL',P..'on',q.tab)
  elseif q.pres then redis.call('HSET',P..'on',q.tab,now..'|'..q.pres) end
end
local on=redis.call('HGETALL',P..'on')
local fresh={}
for i=1,#on,2 do
  local s=on[i+1]
  local bar=string.find(s,'|',1,true)
  local t=bar and tonumber(string.sub(s,1,bar-1)) or 0
  if now-t>15000 then redis.call('HDEL',P..'on',on[i])
  elseif on[i]~=q.tab then fresh[#fresh+1]=string.sub(s,bar+1) end
end
local since=tonumber(q.since) or 0
local lim=40
if since==0 then lim=200 end
local raw=redis.call('LRANGE',P..'chat',-lim,-1)
local chat={}
for i=1,#raw do
  local ok,m=pcall(cjson.decode,raw[i])
  if ok and type(m)=='table' and (tonumber(m.t) or 0)>=since then chat[#chat+1]=raw[i] end
end
local ver=redis.call('GET',P..'v')
if not ver then ver='0' end
local data=false
if ver~=tostring(q.ver or '') or since==0 then
  data={redis.call('HGETALL',M),redis.call('HGETALL',P..'pl'),redis.call('HGETALL',P..'sol')}
end
local won=redis.call('HGET',M,'won')=='true'
local tl=redis.call('TTL',M)
local want=won and TTLW or TTL
if tl<0 or tl>want or (#(q.ops or {})>0) or tl<want-3600 then
  for _,k in ipairs({M,P..'pl',P..'on',P..'chat',P..'sol',P..'v'}) do redis.call('EXPIRE',k,want) end
end
return {1,ver,data,fresh,chat}
`;
