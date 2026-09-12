import{o as e}from"./rolldown-runtime.DAXXjFlN.js";import{S as t,_ as n,v as r}from"./vendor-styled.CUVeJMEc.js";import{u as i,w as a}from"./vendor-react.DMfDKxvM.js";import{t as o}from"./ApiClient.DimJ6VRg.js";import{t as s}from"./useStores.C5C39VN7.js";import{t as c}from"./lib.BFJBM-qL.js";import{t as l}from"./Button._cTHwaT5.js";import{t as u}from"./InputSearch.4GSA5Wyp.js";import{t as d}from"./Empty.RkYvhhi9.js";import{t as f}from"./Scene.Cxm5Gdny.js";import{t as p}from"./tabNavigation.Cb_mlpWV.js";import{n as ee,r as m,t as h}from"./customData.sWC5aW6W.js";var g=c(),_=e(t());n();var v=a(),y=`outline.desktop.discuss.likes.v1`;function b(e){try{return JSON.parse(localStorage.getItem(`${y}.${e}`)??`{}`)}catch{return{}}}function x(){let{documents:e,tabs:t,auth:n}=s(),r=i(),a=n.currentTeamId??window.location.host,[c,x]=_.useState([]),[j,M]=_.useState([]),[N,P]=_.useState(``),[F,I]=_.useState(null),[L,R]=_.useState(!0),[z,B]=_.useState(!1),[V,H]=_.useState(``),[U,W]=_.useState(``),[G,K]=_.useState(()=>b(a)),[q,J]=_.useState({}),[Y,X]=_.useState(null),Z=_.useCallback(async()=>{R(!0),X(null);try{let e=(await m()).find(e=>[`论坛空间`,`讨论区`].includes(e.name.trim()));if(!e){x([]),M([]);return}let t=await h(e.id),n=t.filter(e=>(e.children?.length??0)>0),r=new Set(n.map(e=>e.id));M(n),x(ee(t).filter(e=>!r.has(e.id)).map(e=>e))}catch(e){X(e instanceof Error?e.message:`加载失败`)}finally{R(!1)}},[]);_.useEffect(()=>{Z()},[Z]),_.useEffect(()=>{let e=!1;return o.post(`/pins.list`,{limit:100}).then(t=>{e||J(Object.fromEntries((t.data?.pins??[]).map(e=>[e.documentId,e.id])))}).catch(()=>void 0),()=>{e=!0}},[c.length]);let Q=async()=>{if(V.trim())try{let n=await o.post(`/documents.create`,{title:V.trim(),text:``,collectionId:(await m()).find(e=>[`论坛空间`,`讨论区`].includes(e.name.trim()))?.id,...U?{parentDocumentId:U}:{},publish:!0});B(!1),H(``),await Z(),n.data&&p(r,t,{id:n.data.id,url:e.get(n.data.id)?.url??`/doc/${n.data.id}`,title:n.data.title??V.trim()})}catch(e){X(e instanceof Error?e.message:`发帖失败`)}},oe=e=>{let t={...G,[e]:!G[e]};K(t),localStorage.setItem(`${y}.${a}`,JSON.stringify(t))},se=async e=>{try{if(q[e])await o.post(`/pins.delete`,{id:q[e]}),J(t=>{let n={...t};return delete n[e],n});else{let t=await o.post(`/pins.create`,{documentId:e});J(n=>({...n,[e]:t.data.id}))}}catch(e){X(e instanceof Error?e.message:`置顶操作失败`)}},$=c.filter(e=>(!F||e.parentDocumentId===F)&&e.title.toLowerCase().includes(N.trim().toLowerCase())).sort((e,t)=>Number(!!q[t.id])-Number(!!q[e.id]));return(0,v.jsxs)(f,{icon:(0,v.jsx)(g.CommentIcon,{}),title:`讨论区`,textTitle:`讨论区`,wide:!0,actions:(0,v.jsxs)(S,{children:[(0,v.jsx)(l,{onClick:()=>void Z(),neutral:!0,children:`刷新`}),(0,v.jsx)(l,{onClick:()=>B(!0),children:`发新帖`})]}),children:[(0,v.jsx)(C,{children:`主题即文档，回复使用官方评论；讨论区和知识库使用同一账号与导航。`}),(0,v.jsxs)(w,{children:[(0,v.jsx)(u,{value:N,onChange:e=>P(e.target.value),placeholder:`搜索讨论主题…`}),z&&(0,v.jsxs)(T,{children:[(0,v.jsx)(`input`,{autoFocus:!0,value:V,onChange:e=>H(e.target.value),onKeyDown:e=>e.key===`Enter`&&void Q(),placeholder:`帖子标题…`}),(0,v.jsxs)(`select`,{value:U,onChange:e=>W(e.target.value),children:[(0,v.jsx)(`option`,{value:``,children:`不分版块`}),j.map(e=>(0,v.jsx)(`option`,{value:e.id,children:e.title},e.id))]}),(0,v.jsx)(l,{onClick:()=>void Q(),disabled:!V.trim(),children:`发布`}),(0,v.jsx)(l,{onClick:()=>B(!1),neutral:!0,children:`取消`})]})]}),j.length>0&&(0,v.jsxs)(E,{children:[(0,v.jsx)(D,{$active:!F,onClick:()=>I(null),children:`全部`}),j.map(e=>(0,v.jsx)(D,{$active:F===e.id,onClick:()=>I(F===e.id?null:e.id),children:e.title},e.id))]}),Y&&(0,v.jsx)(O,{children:Y}),L?(0,v.jsx)(d,{children:`正在加载讨论主题…`}):$.length===0?(0,v.jsx)(d,{children:`暂时没有匹配的讨论主题。`}):(0,v.jsx)(k,{children:$.map(n=>(0,v.jsxs)(te,{onClick:()=>p(r,t,{id:n.id,url:e.get(n.id)?.url??`/doc/${n.id}`,title:n.title||`无标题`}),children:[(0,v.jsxs)(ne,{children:[(0,v.jsx)(re,{children:n.title||`无标题`}),(0,v.jsxs)(ie,{children:[n.createdBy?.name??`成员`,n.createdAt?` · ${new Date(n.createdAt).toLocaleDateString()}`:``]})]}),(0,v.jsxs)(ae,{onClick:e=>{e.stopPropagation(),oe(n.id)},$active:!!G[n.id],children:[`♥ `,G[n.id]?`已赞`:`点赞`]}),(0,v.jsx)(A,{onClick:e=>{e.stopPropagation(),se(n.id)},$active:!!q[n.id],children:q[n.id]?`📌 已置顶`:`置顶`})]},n.id))})]})}var S=r.div`
  display: flex;
  gap: 8px;
`,C=r.p`
  color: ${e=>e.theme.textTertiary};
  margin: 20px 0 12px;
`,w=r.div`
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
`,T=r.div`
  display: flex;
  gap: 8px;
  align-items: center;
  input,
  select {
    border: 1px solid ${e=>e.theme.divider};
    border-radius: 6px;
    padding: 8px;
    background: ${e=>e.theme.background};
    color: ${e=>e.theme.text};
  }
`,E=r.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 16px;
`,D=r.button`
  border: 1px solid ${e=>e.$active?e.theme.primary:e.theme.divider};
  border-radius: 999px;
  padding: 4px 9px;
  color: ${e=>e.$active?e.theme.primary:e.theme.textTertiary};
  background: transparent;
  cursor: pointer;
`,O=r.p`
  color: ${e=>e.theme.danger};
`,k=r.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`,te=r.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px;
  border: 1px solid ${e=>e.theme.divider};
  border-radius: 8px;
  cursor: pointer;
  &:hover {
    background: ${e=>e.theme.surface};
  }
`,ne=r.div`
  flex: 1;
  min-width: 0;
`,re=r.div`
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`,ie=r.div`
  color: ${e=>e.theme.textTertiary};
  font-size: 12px;
  margin-top: 5px;
`,ae=r.button`
  border: 0;
  background: transparent;
  color: ${e=>e.$active?e.theme.primary:e.theme.textTertiary};
  cursor: pointer;
  font-size: 12px;
`,A=r.button`
  border: 0;
  background: transparent;
  color: ${e=>e.$active?e.theme.primary:e.theme.textTertiary};
  cursor: pointer;
  font-size: 12px;
`;export{x as default};