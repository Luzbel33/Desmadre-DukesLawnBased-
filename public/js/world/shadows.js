// Sombras en dos capas (el sol no se mueve):
// - Luz 0 (sol): sombra dinámica de alta resolución alrededor del jugador (personajes, objetos, todo).
// - Luz 1 (sol "horneado", intensidad 0): un mapa de sombras de TODO el mapa que se calcula una sola vez
//   con lo quieto (edificios, árboles, setos). De lejos manda esta; de cerca la dinámica, y en el borde
//   se funden (antes las sombras se cortaban de golpe a ~40 m y lo lejano quedaba chato).
// Se parchea el código de luces de three.js: la luz 1 no ilumina, solo presta su mapa de sombras.
import * as THREE from 'three';

let installed = false;

export function installFarShadowChunk() {
  if (installed) return;
  installed = true;
  const C = THREE.ShaderChunk;
  const src = C.lights_fragment_begin;
  const start = src.indexOf('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )');
  const end = src.indexOf('#endif', src.indexOf('#pragma unroll_loop_end', start)) + '#endif'.length;
  if (start < 0 || end < start) { console.warn('sombras lejanas: el shader de luces cambió, se usan las sombras comunes'); return; }
  const block = /* glsl */ `#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 1
	float farShadow = 1.0;
	float nearW = 0.0;
	if ( receiveShadow ) {
		vec4 nc = vDirectionalShadowCoord[ 0 ];
		nc.xyz /= nc.w;
		float edge = min( min( nc.x, 1.0 - nc.x ), min( nc.y, 1.0 - nc.y ) );
		nearW = smoothstep( 0.0, 0.08, edge ) * step( nc.z, 1.0 );
		if ( nearW < 1.0 ) farShadow = getShadow( directionalShadowMap[ 1 ], directionalLightShadows[ 1 ].shadowMapSize, directionalLightShadows[ 1 ].shadowIntensity, directionalLightShadows[ 1 ].shadowBias, directionalLightShadows[ 1 ].shadowRadius, vDirectionalShadowCoord[ 1 ] );
	}
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		#if ! ( defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 1 && UNROLLED_LOOP_INDEX == 1 )
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		#if NUM_DIR_LIGHT_SHADOWS > 1 && UNROLLED_LOOP_INDEX == 0
		directLight.color *= ( directLight.visible && receiveShadow ) ? mix( farShadow, getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ), nearW ) : 1.0;
		#else
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
		#endif
	}
	#pragma unroll_loop_end
#endif`;
  C.lights_fragment_begin = src.slice(0, start) + block + src.slice(end);
}

// Luz "horneada": cubre todo el mapa; su mapa se dibuja una sola vez (bake)
export function makeFarSun(sunDir, size = 4096, half = 165) {
  const far = new THREE.DirectionalLight(0xffffff, 0);
  far.castShadow = true;
  far.shadow.mapSize.set(size, size);
  const c = far.shadow.camera;
  c.left = -half; c.right = half; c.top = half; c.bottom = -half;
  c.near = 1; c.far = 900;
  far.shadow.bias = -0.0011;
  far.shadow.normalBias = 0.1;
  far.shadow.radius = 1.5;
  far.shadow.autoUpdate = false;
  // PCF usa un sampler de profundidad: necesita un mapa válido desde el primer
  // cuadro, incluso antes del bake definitivo de árboles y edificios.
  far.shadow.needsUpdate = true;
  far.position.copy(sunDir).multiplyScalar(400);
  far.target.position.set(0, 0, 0);
  return far;
}
