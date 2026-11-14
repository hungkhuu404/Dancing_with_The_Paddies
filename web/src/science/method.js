import {referenceData} from './referenceData.js';
import {pageReady,pageError} from './referencePage.js';
import {methodRows} from './calendarModel.js';
import {fmtDate} from '../map/contract.js';
const number=v=>Number.isFinite(v)?v.toLocaleString('en-US',{maximumFractionDigits:3}):'Not supplied';
async function start(){
  const {site,data}=await referenceData(['meta.json']),meta=data['meta.json'],rows=methodRows(meta),acq=meta.acquisitions;if(!acq?.length)throw Error('Acquisition metadata is unavailable.');
  pageReady(site);document.querySelector('#data-summary').textContent=`${meta.grid.n_cells.toLocaleString('en-US')} blocks, ${meta.grid.cell_m} m wide, observed in ${acq.length} acquisitions from ${fmtDate(acq[0].date_local)} to ${fmtDate(acq.at(-1).date_local)}. Dates use ${meta.timezone||'the site local calendar'}.`;
  document.querySelector('#default-rule').textContent=`Default rule ${meta.method?.rule||'not supplied'}: HH < ${number(meta.method?.hh_db_max)} dB and HV < ${number(meta.method?.hv_db_max)} dB.`;
  document.querySelector('#filter-rule').textContent=meta.method?.single_flip_filter===true?'The published method applies the single-flip filter. The calendar uses the filtered s record, not s_raw.':meta.method?.single_flip_filter===false?'The published method does not apply the single-flip filter.':'Filter details are not supplied in this metadata.';
  const body=document.querySelector('#threshold-rows');for(const row of rows){const tr=body.insertRow();for(const value of [fmtDate(row.date),row.track,row.rule||'Not supplied',number(row.hh),number(row.hv)]){const td=tr.insertCell();td.textContent=value;}}
  const source=document.querySelector('#published-sources');for(const text of meta.sources||[]){const li=document.createElement('li');li.textContent=text;source.append(li);}
  for(const [id,file]of [['metadata-link','meta.json'],['series-link','series.json'],['cells-link','cells.geojson']]){const a=document.querySelector('#'+id);a.href=import.meta.env.BASE_URL+'data/'+site.id+'/'+file;a.download=file;}
  document.querySelector('#page-status').hidden=true;
}
start().catch(pageError);
