/* Post-traitement — graine : rendu direct (à remplacer par bloom + étalonnage). Contrat : CONTRACT.md */
(() => {
'use strict';
const WW = window.WW = window.WW || {};
WW.createPost = function (THREE, renderer, scene, camera, opts) {
  return { render() { renderer.render(scene, camera); }, setSize() {} };
};
})();
