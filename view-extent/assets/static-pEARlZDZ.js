import{x as S}from"./index-HvZUpAiV.js";/**
 * @license
 * Copyright 2020 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const u=Symbol.for(""),d=t=>{if((t==null?void 0:t.r)===u)return t==null?void 0:t._$litStatic$},m=t=>({_$litStatic$:t,r:u}),v=(t,...e)=>({_$litStatic$:e.reduce((o,r,l)=>o+(a=>{if(a._$litStatic$!==void 0)return a._$litStatic$;throw Error(`Value passed to 'literal' function must be a 'literal' result: ${a}. Use 'unsafeStatic' to pass non-literal values, but
            take care to ensure page security.`)})(r)+t[l+1],t[0]),r:u}),p=new Map,h=t=>(e,...o)=>{const r=o.length;let l,a;const s=[],$=[];let n,i=0,c=!1;for(;i<r;){for(n=e[i];i<r&&(a=o[i],(l=d(a))!==void 0);)n+=l+e[++i],c=!0;i!==r&&$.push(a),s.push(n),i++}if(i===r&&s.push(e[r]),c){const f=s.join("$$lit$$");(e=p.get(f))===void 0&&(s.raw=s,p.set(f,e=s)),o=$}return t(e,...o)},b=h(S);export{v as i,m as s,b as u};
