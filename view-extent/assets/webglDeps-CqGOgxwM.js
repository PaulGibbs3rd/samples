import{E as _,o as g}from"./VertexArrayObject-uoJ0-Wyy.js";import{x as j,s as F}from"./FramebufferObject-DWpknOee.js";import{r as c}from"./ProgramTemplate-BfiyU3Gv.js";import{e as w,a as O}from"./ProgramTemplate-BfiyU3Gv.js";import{dw as A}from"./index-HvZUpAiV.js";import{t as p}from"./NestedMap-GuqgquCN.js";import"./memoryEstimations-37nmr0XF.js";class ${constructor(e){this._rctx=e,this._store=new p}dispose(){this._store.forAll(e=>e.dispose()),this._store.clear()}acquire(e,t,o,n){const r=this._store.get(e,t);if(r!=null)return r.ref(),r;const s=new c(this._rctx,e,t,o,n);return s.ref(),this._store.set(e,t,s),s}get test(){}}function l(i){const{options:e,value:t}=i;return typeof e[t]=="number"}function x(i){let e="";for(const t in i){const o=i[t];if(typeof o=="boolean")o&&(e+=`#define ${t}
`);else if(typeof o=="number")e+=`#define ${t} ${o.toFixed()}
`;else if(typeof o=="object")if(l(o)){const{value:n,options:r,namespace:s}=o,f=s?`${s}_`:"";for(const a in r)e+=`#define ${f}${a} ${r[a].toFixed()}
`;e+=`#define ${t} ${f}${n}
`}else{const n=o.options;let r=0;for(const s in n)e+=`#define ${n[s]} ${(r++).toFixed()}
`;e+=`#define ${t} ${n[o.value]}
`}}return e}export{_ as BufferObject,j as FramebufferObject,c as Program,$ as ProgramCache,F as Renderbuffer,w as ShaderCompiler,A as Texture,g as VertexArrayObject,O as createProgram,x as glslifyDefineMap};
