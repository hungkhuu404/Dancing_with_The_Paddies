// Explicit site illustration only. Published sites never receive synthetic exports.
import {siteOptions} from '../tools/site-options.mjs';
import {makeSiteFixture} from './make-site-fixture.mjs';
const {profile,args}=siteOptions();
if(profile.scene.fixture_preview!==true)throw Error('Published sites do not allow synthetic water exports.');
if(!args[0])throw Error('An explicit illustration output directory is required.');
console.log(makeSiteFixture(args[0],profile));
