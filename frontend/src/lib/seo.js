import { useEffect } from 'react';

const SITE_ORIGIN='https://conspace.vn';
const DEFAULT_TITLE='CONSPACE · Sự thật ngành Xây';
const DEFAULT_DESCRIPTION='CONSPACE — Sự thật ngành Xây. Nơi chủ nhà, kiến trúc sư và nhà thầu cùng nhìn một công trình từ ba phía.';

function ensureMeta(selector,attributes){
  let element=document.head.querySelector(selector);
  if(!element){
    element=document.createElement('meta');
    for(const [key,value] of Object.entries(attributes)) element.setAttribute(key,value);
    document.head.appendChild(element);
  }
  return element;
}

function ensureCanonical(){
  let element=document.head.querySelector('link[rel="canonical"]');
  if(!element){
    element=document.createElement('link');
    element.rel='canonical';
    document.head.appendChild(element);
  }
  return element;
}

function absolute(path){
  if(!path)return SITE_ORIGIN+'/';
  try{return new URL(path,SITE_ORIGIN).href;}catch{return SITE_ORIGIN+'/';}
}

export function applySeoMetadata({
  title,
  description,
  canonicalPath='/',
  index=true,
  type='website',
  image=null,
  publishedTime=null,
  modifiedTime=null,
}={}){
  const cleanTitle=String(title||'').trim();
  const finalTitle=cleanTitle?cleanTitle+' | CONSPACE · Sự thật ngành Xây':DEFAULT_TITLE;
  const finalDescription=String(description||DEFAULT_DESCRIPTION).trim().slice(0,320);
  const canonicalUrl=absolute(canonicalPath);
  document.title=finalTitle;

  ensureMeta('meta[name="description"]',{name:'description'}).setAttribute('content',finalDescription);
  ensureMeta('meta[name="robots"]',{name:'robots'}).setAttribute('content',index?'index,follow,max-image-preview:large':'noindex,nofollow');
  ensureMeta('meta[property="og:title"]',{property:'og:title'}).setAttribute('content',finalTitle);
  ensureMeta('meta[property="og:description"]',{property:'og:description'}).setAttribute('content',finalDescription);
  ensureMeta('meta[property="og:type"]',{property:'og:type'}).setAttribute('content',type);
  ensureMeta('meta[property="og:url"]',{property:'og:url'}).setAttribute('content',canonicalUrl);
  ensureMeta('meta[name="twitter:card"]',{name:'twitter:card'}).setAttribute('content',image?'summary_large_image':'summary');
  ensureMeta('meta[name="twitter:title"]',{name:'twitter:title'}).setAttribute('content',finalTitle);
  ensureMeta('meta[name="twitter:description"]',{name:'twitter:description'}).setAttribute('content',finalDescription);
  ensureCanonical().href=canonicalUrl;

  const ogImage=ensureMeta('meta[property="og:image"]',{property:'og:image'});
  const twitterImage=ensureMeta('meta[name="twitter:image"]',{name:'twitter:image'});
  if(image){
    const imageUrl=absolute(image);
    ogImage.setAttribute('content',imageUrl);
    twitterImage.setAttribute('content',imageUrl);
  }else{
    ogImage.removeAttribute('content');
    twitterImage.removeAttribute('content');
  }

  const published=ensureMeta('meta[property="article:published_time"]',{property:'article:published_time'});
  const modified=ensureMeta('meta[property="article:modified_time"]',{property:'article:modified_time'});
  if(type==='article'&&publishedTime) published.setAttribute('content',publishedTime); else published.removeAttribute('content');
  if(type==='article'&&modifiedTime) modified.setAttribute('content',modifiedTime); else modified.removeAttribute('content');

  return {title:finalTitle,description:finalDescription,canonicalUrl,index,type};
}

export function useSeoMetadata(options){
  const {
    title,description,canonicalPath,index=true,type='website',image=null,publishedTime=null,modifiedTime=null,
  }=options||{};
  useEffect(()=>{
    applySeoMetadata({title,description,canonicalPath,index,type,image,publishedTime,modifiedTime});
  },[title,description,canonicalPath,index,type,image,publishedTime,modifiedTime]);
}

export const SEO_DEFAULTS=Object.freeze({SITE_ORIGIN,DEFAULT_TITLE,DEFAULT_DESCRIPTION});
