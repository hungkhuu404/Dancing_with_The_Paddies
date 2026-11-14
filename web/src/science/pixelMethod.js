export function isPixelV2(meta){
  const m=meta?.method;
  return !meta?.fixture&&meta?.contract_version==='2.0.0'&&m?.classification==='pixel_fraction_75_dual_50'&&m.water_fraction===.75&&m.fill_min_fraction===.5&&m.joint_valid_fraction===.7&&m.selection_status==='post_hoc'&&m.single_flip_filter===true;
}

export function methodDescription(m){
  if(!isPixelV2({contract_version:'2.0.0',method:m}))throw Error('Unsupported pixel method metadata.');
  return 'A block needs at least 70% jointly valid pixels. It is water when at least 75% of those pixels meet both thresholds. The simultaneous filter changes N-W-N to N-N-N; W-N-W is filled only when the middle observation has at least 50% water pixels. Missing observations are skipped. The method was selected post-hoc against DSWx-S1; agreement is not independent validation and DSWx-S1 is not ground truth.';
}
