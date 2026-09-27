// Resolve the same vendored modules as the browser importmap; no npm installation.
export async function resolve(specifier, context, nextResolve) {
 const prefix = new URL('../public/vendor/', import.meta.url);
 let relative = specifier === 'three' ? 'three/three.module.js' : specifier === 'rapier' ? 'rapier/rapier.mjs' : specifier.startsWith('three/addons/') ? specifier.replace('three/addons/', 'three/addons/') : null;
 if (relative) return {url:new URL(relative,prefix).href,shortCircuit:true};
 return nextResolve(specifier,context);
}
