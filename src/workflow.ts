import {z} from 'zod';

export const workflowSteps={
  'article.fetch':{label:'知乎正文',engine:'local',description:'直接保存知乎站内搜索接口返回的正文，不再抓取来源网页。',input:'zhihu-result',output:'source-text'},
  'article.translate':{label:'翻译为英文',engine:'ai',description:'中文知乎正文通过 AI 忠实翻译为英文，保持段落和事实不变。',input:'source-text',output:'article-text'},
  'article.questions':{label:'理解题与关键词',engine:'ai',description:'按原文出题，保存参考依据、知识点和语境词汇。',input:'article-text',output:'article-lesson'},
  'article.publish':{label:'保存阅读材料',engine:'local',description:'保存可阅读的文章与练习；上架由管理员控制。',input:'article-lesson',output:'learning-article'},
  'source.read':{label:'原文提取',engine:'local',description:'校验文件版本，读取 PDF、EPUB、DOCX 或文本原文。',input:'source-file',output:'source-text'},
  'source.audit':{label:'逐页覆盖检查',engine:'local',description:'检查 PDF 文字层和图片区域，标记需要识别的页面。',input:'source-file',output:'page-audit'},
  'source.ocr':{label:'离线中英文 OCR',engine:'local-model',description:'RapidOCR CPU 逐页识别并复用缓存，保存坐标、置信度及存疑页面。',input:'page-audit',output:'recognized-pages'},
  'source.merge':{label:'原文合并与溯源',engine:'local',description:'优先保留原文字层，按位置去重并记录页码；漏页或低置信度保持部分完成。',input:'recognized-pages',output:'source-text'},
  'text.analyze':{label:'分句与词性',engine:'local-model',description:'spaCy 本地分句、词性和词形分析，记录排除原因；词格固定为原文位置。',input:'source-text',output:'sentence-inventory'},
  'dictionary.lookup':{label:'本地词典',engine:'local',description:'查询离线 ECDICT，补充词汇基础释义；单一词义标注为词典义，多义词交给 AI 判断语境。',input:'sentence-inventory',output:'dictionary-inventory'},
  'cache.prepare':{label:'缓存与组批',engine:'local',description:'恢复历史解析结果，匹配原书译文和逐句缓存；按输入输出预算收集待处理句子。',input:'sentence-inventory',output:'pending-batches'},
  'sentence.translate':{label:'补充中文翻译',engine:'ai',description:'复用原书译文和历史缓存，仅为缺少译文的句子调用 AI。',input:'sentence-inventory',output:'translated-sentences'},
  'sentence.gloss':{label:'语境释义',engine:'ai',description:'按固定词格编号补充中文释义，不允许模型改写英文或重新分词。',input:'translated-sentences',output:'annotated-sentences'},
  'records.validate':{label:'来源与结构校验',engine:'local',description:'检查英文来源、译文、词格及记录引用；保留待补齐清单。',input:'annotated-sentences',output:'validated-records'},
  'records.publish':{label:'增量入库',engine:'local',description:'幂等发布合格内容，保留旧内容、句子 ID 与学习记录。',input:'validated-records',output:'published-records'},
} as const;
export type WorkflowStep=keyof typeof workflowSteps;
const stepSchema=z.string().regex(/^[a-z][a-z0-9.-]{0,79}$/);
export const workflowSchema=z.object({
  id:z.string().regex(/^[a-z][a-z0-9-]{0,79}$/),version:z.number().int().positive(),name:z.string().min(1).max(100),
  nodes:z.array(z.object({id:z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),step:stepSchema,dependsOn:z.array(z.string()).max(20)})).min(1).max(30),
}).superRefine((flow,ctx)=>{
  const ids=new Set(flow.nodes.map(n=>n.id));
  if(ids.size!==flow.nodes.length)ctx.addIssue({code:'custom',message:'Duplicate workflow node ID'});
  const steps=new Set(flow.nodes.map(n=>n.step));
  if(steps.size!==flow.nodes.length)ctx.addIssue({code:'custom',message:'Each step can occur once per flow'});
  const visiting=new Set<string>(),visited=new Set<string>();
  function visit(id:string):boolean{
    if(visiting.has(id))return false;if(visited.has(id))return true;
    const node=flow.nodes.find(n=>n.id===id);if(!node)return false;
    visiting.add(id);for(const dep of node.dependsOn)if(!visit(dep))return false;
    visiting.delete(id);visited.add(id);return true;
  }
  if(flow.nodes.some(n=>!visit(n.id)))ctx.addIssue({code:'custom',message:'Workflow has a cycle or unknown dependency'});
});
export type WorkflowDefinition=z.infer<typeof workflowSchema>;
export const legacyParsingWorkflow:WorkflowDefinition={id:'book-learning',version:1,name:'书籍学习内容解析',nodes:[
  {id:'extract',step:'source.read',dependsOn:[]},
  {id:'nlp',step:'text.analyze',dependsOn:['extract']},
  {id:'translate',step:'sentence.translate',dependsOn:['nlp']},
  {id:'gloss',step:'sentence.gloss',dependsOn:['translate']},
  {id:'validate',step:'records.validate',dependsOn:['gloss']},
  {id:'publish',step:'records.publish',dependsOn:['validate']},
]};
export const defaultParsingWorkflow:WorkflowDefinition={...legacyParsingWorkflow,version:4,nodes:[
  legacyParsingWorkflow.nodes[0]!,
  {id:'page-audit',step:'source.audit',dependsOn:['extract']},
  {id:'offline-ocr',step:'source.ocr',dependsOn:['page-audit']},
  {id:'text-merge',step:'source.merge',dependsOn:['offline-ocr']},
  {...legacyParsingWorkflow.nodes[1]!,dependsOn:['text-merge']},
  {id:'dictionary',step:'dictionary.lookup',dependsOn:['nlp']},
  {id:'prepare',step:'cache.prepare',dependsOn:['dictionary']},
  {...legacyParsingWorkflow.nodes[2]!,dependsOn:['prepare']},
  ...legacyParsingWorkflow.nodes.slice(3),
]};
export const articleWorkflow:WorkflowDefinition={id:'article-learning',version:2,name:'英文阅读理解',nodes:[{id:'article-source',step:'article.fetch',dependsOn:[]},{id:'article-translate',step:'article.translate',dependsOn:['article-source']},{id:'article-questions',step:'article.questions',dependsOn:['article-translate']},{id:'article-save',step:'article.publish',dependsOn:['article-questions']}]};
export const taskTemplates=[{...defaultParsingWorkflow,description:'从书籍原文提取可学习内容，按句恢复，分批入库。',input:{kind:'source-selection',formats:['pdf','epub','azw3','docx','txt','markdown'],requiresAgent:true},nodes:defaultParsingWorkflow.nodes.map(node=>({...node,...workflowSteps[node.step as WorkflowStep]}))},{...articleWorkflow,description:'读取知乎正文，必要时翻译为英文并生成阅读理解题。',input:{kind:'article-selection',formats:['html'],requiresAgent:true},nodes:articleWorkflow.nodes.map(node=>({...node,...workflowSteps[node.step as WorkflowStep]}))}];

// Reusable node executor: handlers own domain work; this layer owns dependencies and events.
export class WorkflowRun{
  private done=new Set<string>();
  private counts=new Map<string,{completed:number;failed:number}>();
  constructor(readonly definition:WorkflowDefinition,private emit:(event:Record<string,unknown>)=>Promise<void>){workflowSchema.parse(definition);}
  async resourceState(step:string,state:'resource_wait'|'running'){
    const node=this.definition.nodes.find(n=>n.step===step);if(!node)throw new Error(`Unknown workflow step ${step}`);
    await this.emit({status:'workflow_node',nodeId:node.id,step,state,...(this.counts.get(node.id)??{completed:0,failed:0})});
  }
  async skip(step:string){
    const node=this.definition.nodes.find(n=>n.step===step);if(!node||node.dependsOn.some(id=>!this.done.has(id)))throw new Error(`Unfinished dependencies for ${step}`);
    this.done.add(node.id);await this.emit({status:'workflow_node',nodeId:node.id,step,state:'skipped',completed:0,failed:0});
  }
  async run<T>(step:string,handler:()=>Promise<T>):Promise<T>{
    const node=this.definition.nodes.find(n=>n.step===step);if(!node)throw new Error(`Unknown workflow step ${step}`);
    if(node.dependsOn.some(id=>!this.done.has(id)))throw new Error(`Unfinished dependencies for ${node.id}`);
    const counts=this.counts.get(node.id)??{completed:0,failed:0};this.counts.set(node.id,counts);
    const started=Date.now();
    await this.emit({status:'workflow_node',nodeId:node.id,step,state:'running',...counts});
    try{const result=await handler();this.done.add(node.id);counts.completed++;await this.emit({status:'workflow_node',nodeId:node.id,step,state:'waiting',...counts,elapsedMs:Date.now()-started});return result;}
    catch(error){counts.failed++;await this.emit({status:'workflow_node',nodeId:node.id,step,state:'failed',...counts,error:error instanceof Error?error.message:String(error),elapsedMs:Date.now()-started});throw error;}
  }
  async finish(step:string,failedItems=0){
    const node=this.definition.nodes.find(n=>n.step===step);if(!node)return;
    const counts=this.counts.get(node.id)??{completed:0,failed:0};
    await this.emit({status:'workflow_node',nodeId:node.id,step,state:failedItems||counts.failed?'partial':counts.completed?'completed':'skipped',...counts,failedItems});
  }
}
