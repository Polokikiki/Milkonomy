import{d as m,g as _,m as a,w as n,ab as i,aE as u,f}from"./index-C6ny5T5-.js";import{E as g}from"./el-button-BddqwYe5.js";import{E}from"./el-card-DBhc5Ezp.js";import{E as w}from"./index-CJN5u5j8.js";import{_ as y}from"./_plugin-vue_export-helper-DlAUqK2U.js";import"./use-form-common-props-CazsYdU2.js";import"./directive-BS6ddqxf.js";const x={lock:!0,text:"加载中..."},p=(o,e={})=>{let r;return async(...c)=>{try{return r=w.service({...x,...e}),await o(...c)}finally{r.close()}}},C={code:0,data:{list:[]},message:"获取成功"};function S(o){return new Promise(e=>{setTimeout(()=>{e({...C,data:{list:o}})},1e3)})}function v(){return new Promise((o,e)=>{setTimeout(()=>{e(new Error("发生错误"))},1e3)})}const k={class:"app-container"},A=`
  <path class="path" d="
    M 30 15
    L 28 17
    M 25.61 25.61
    A 15 15, 0, 0, 1, 15 30
    A 15 15, 0, 1, 1, 27.99 7.5
    L 15 15
  " style="stroke-width: 4px; fill: rgba(0, 0, 0, 0)"/>
`,b=m({__name:"use-fullscreen-loading",setup(o){const e={text:"即将发生错误...",background:"#F56C6C20",svg:A,svgViewBox:"-10, -10, 50, 50"};async function r(){const s=await p(S)([1,2,3]);u.success(`${s.message}，传参为 ${s.data.list.toString()}`)}async function c(){try{await p(v,e)()}catch(s){u.error(s.message)}}return(s,t)=>{const l=E,d=g;return f(),_("div",k,[a(l,{shadow:"never"},{default:n(()=>t[0]||(t[0]=[i(" 该示例是演示：通过将要执行的函数传递给 composable，让 composable 自动开启全屏 loading，函数执行结束后自动关闭 loading ")])),_:1}),a(l,{header:"示例",shadow:"never"},{default:n(()=>[a(d,{type:"primary",onClick:r},{default:n(()=>t[1]||(t[1]=[i(" 查询成功 ")])),_:1}),a(d,{type:"danger",onClick:c},{default:n(()=>t[2]||(t[2]=[i(" 查询失败 ")])),_:1})]),_:1})])}}}),I=y(b,[["__scopeId","data-v-d330363c"]]);export{I as default};
