import {isPixelV2} from '../science/pixelMethod.js';
import {checkSiteMeta} from './siteRules.js';
export function assertPublishedMeta(meta){
 if(!isPixelV2(meta))throw Error('Expected published data-contract 2.0.0 pixel observations.');
 return meta;
}
/** A labelled landscape illustration is separate from published water results. */
export function assertSceneMeta(profile,meta){
 checkSiteMeta(profile,meta);
 if(meta.fixture!==true)return assertPublishedMeta(meta);
 const frame=profile.frame,cells=(frame.e1-frame.e0)*(frame.n1-frame.n0)/62500;
 if(profile.scene.fixture_preview!==true||meta.contract_version!=='1.0.0'||meta.grid.cell_m!==250||meta.grid.n_cells!==cells)throw Error('This location does not allow the supplied illustration.');
 return meta;
}
