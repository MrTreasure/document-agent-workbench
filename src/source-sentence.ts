function normalizeTypography(text:string){
  return text.normalize('NFC').replace(/[\u2018\u2019\u02bc]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/\s+/g,' ').trim();
}

export function sentenceOccursInSource(source:string,sentence:unknown):boolean{
  return createSourceMatcher(source)(sentence);
}

export function createSourceMatcher(source:string){
  const text=normalizeTypography(source);
  return (sentence:unknown):boolean=>{
  if(typeof sentence!=='string')return false;
  const phrase=normalizeTypography(sentence).replace(/[.!?]+$/,'').trimEnd();
  if(!phrase||!/[A-Za-z]/.test(phrase))return false;
  // Only typography and terminal punctuation vary; internal words/punctuation remain exact.
  const word=/[\p{Script=Latin}\p{M}\p{N}_'\-]/u;
  for(let start=text.indexOf(phrase);start!==-1;start=text.indexOf(phrase,start+1)){
    const before=text[start-1],after=text[start+phrase.length];
    if((!before||!word.test(before)||!word.test(phrase[0]!))&&(!after||!word.test(after)||!word.test(phrase.at(-1)!)))return true;
  }
  return false;
  };
}
