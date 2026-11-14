export function loadingFacts(contract) {
  if(!contract)return 'Landscape ready. Water observations are unavailable.';
  const cells=contract.props.size,step=contract.step,passes=contract.acq.length;
  const area=cells*step*step/1e6;
  return `${cells.toLocaleString('en-US')} blocks cover ${area.toFixed(1)} km². ${passes} observation${passes===1?'':'s'}.${contract.meta.fixture?' Water states are simulated, not results.':''}`;
}
