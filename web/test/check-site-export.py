"""Validate a public fixture against provided data-team schemas, with an explicit frame-AOI proposal."""
import argparse
import json
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker
p=argparse.ArgumentParser();p.add_argument('--data',required=True);p.add_argument('--schemas',required=True);p.add_argument('--frame-schema');args=p.parse_args()
root=Path(args.data);meta=json.loads((root/'bang_rakam/meta.json').read_text(encoding='utf8'))
if args.frame_schema and meta.get('fixture') is not True: raise ValueError('The frame compatibility proposal may only check explicit fixture data')
count=0
for file,schema in [('sites.json','sites'),('bang_rakam/meta.json','meta'),('bang_rakam/cells.geojson','cells'),('bang_rakam/series.json','series'),('bang_rakam/summary.json','summary'),('bang_rakam/places.geojson','places'),('bang_rakam/aoi.geojson','aoi')]:
    path=Path(args.frame_schema) if schema=='aoi' and args.frame_schema else Path(args.schemas)/(schema+'.schema.json')
    Draft202012Validator(json.loads(path.read_text(encoding='utf8')),format_checker=FormatChecker()).validate(json.loads((root/file).read_text(encoding='utf8')));count+=1
print(json.dumps({'schemas_passed':count,'frame_aoi_compatibility_proposal':bool(args.frame_schema),'validation_results_invented':False}))
