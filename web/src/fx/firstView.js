import * as THREE from 'three';

/** Allocate the actual close-view pipeline while the loading overlay is visible.
 * No simulation clock or intro/UI state is advanced. Restore view state even if
 * a render fails; both intro DOF and the finished-intro pipeline are exercised. */
export async function primeFirstView({renderer,camera,controls,scene,post,water,prepare,render,yieldFrame=()=>new Promise(requestAnimationFrame)}){
  const position=camera.position.clone(),rotation=camera.quaternion.clone(),up=camera.up.clone(),target=controls.target.clone();
  const near=camera.near,far=camera.far,controlEnabled=controls.enabled;
  const renderTarget=renderer.getRenderTarget(),clear=new THREE.Color();renderer.getClearColor(clear);
  const alpha=renderer.getClearAlpha(),autoClear=renderer.autoClear,exposure=renderer.toneMappingExposure;
  const shadowAuto=renderer.shadowMap.autoUpdate,shadowNeeds=renderer.shadowMap.needsUpdate;
  const matrixAuto=scene.matrixWorldAutoUpdate,fogDensity=scene.fog?.density;
  const ao=post.ao.enabled,dof=post.dofPass.enabled,visibility=[];
  const reflect=water?.userData.reflect;
  const waterBindings=['uMask','uIds','uState','uWinC','textureMatrix'].map(name=>water?.material?.uniforms[name]).filter(Boolean).map(uniform=>({uniform,value:uniform.value,copy:uniform.value?.isVector2||uniform.value?.isMatrix4?uniform.value.clone():null}));
  scene.traverse(o=>visibility.push([o,o.visible]));
  try{
    prepare();
    for(const withDof of [false,dof]){
      await yieldFrame();
      post.dofPass.enabled=withDof;
      render();
    }
  }finally{
    camera.position.copy(position);camera.quaternion.copy(rotation);camera.up.copy(up);
    camera.near=near;camera.far=far;camera.updateProjectionMatrix();camera.updateMatrixWorld();
    controls.target.copy(target);controls.enabled=controlEnabled;
    for(const [object,visible] of visibility)object.visible=visible;
    if(scene.fog&&fogDensity!==undefined)scene.fog.density=fogDensity;
    scene.matrixWorldAutoUpdate=true;scene.updateMatrixWorld(true);scene.matrixWorldAutoUpdate=matrixAuto;
    post.ao.enabled=ao;post.dofPass.enabled=dof;
    if(water)water.userData.reflect=reflect;
    for(const binding of waterBindings){binding.uniform.value=binding.value;if(binding.copy)binding.value.copy(binding.copy);}
    renderer.setRenderTarget(renderTarget);renderer.setClearColor(clear,alpha);
    renderer.autoClear=autoClear;renderer.toneMappingExposure=exposure;
    renderer.shadowMap.autoUpdate=shadowAuto;renderer.shadowMap.needsUpdate=shadowNeeds;
  }
}
