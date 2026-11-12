import { z } from 'zod';
import { RequestError, validate } from '../http/validation.js';

export const uploadSchema=z.strictObject({
  filename:z.string().min(1).max(255),
  mimeType:z.enum(['image/jpeg','image/png','image/webp','application/pdf']),
  data:z.string().min(4),
});

export function decodeUpload(input,{maxBytes=10*1024*1024,imagesOnly=false}={}){
  const value=validate(uploadSchema,input);
  if(imagesOnly && !value.mimeType.startsWith('image/')) {
    throw new RequestError(415,'UNSUPPORTED_MEDIA_TYPE','Only image files are accepted');
  }
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(value.data) || value.data.length%4!==0) {
    throw new RequestError(400,'INVALID_UPLOAD','File data must be canonical base64');
  }
  const expectedBytes=value.data.length/4*3-(value.data.endsWith('==')?2:value.data.endsWith('=')?1:0);
  if(expectedBytes<1||expectedBytes>maxBytes){
    throw new RequestError(413,'PAYLOAD_TOO_LARGE','File exceeds its maximum allowed size');
  }
  const buffer=Buffer.from(value.data,'base64');
  if(buffer.length!==expectedBytes || buffer.toString('base64')!==value.data){
    throw new RequestError(400,'INVALID_UPLOAD','Invalid file data');
  }
  return {originalname:value.filename,mimetype:value.mimeType,buffer,size:buffer.length};
}
