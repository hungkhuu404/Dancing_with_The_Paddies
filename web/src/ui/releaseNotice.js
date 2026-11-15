import {releaseContext} from '../data/releaseContext.js';
import './releaseNotice.css';
export function mountReleaseNotice(meta,parent=document.body){
  const info=releaseContext(meta);if(!info)return null;
  const note=document.createElement('p');note.className='release-notice';note.setAttribute('role','note');note.textContent=info.label;note.title=info.details;parent.append(note);return note;
}
