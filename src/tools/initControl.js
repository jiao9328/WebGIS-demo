import { Zoom, Fullscreen, MapTheme } from '@antv/l7';
export default (scene, map) => {
  const zoom = new Zoom({
    zoomInTitle: "放大",
    zoomOutTitle: "缩小",
    position: "bottomright",
  });
  scene.addControl(zoom);
  const fullscreen = new Fullscreen({
    btnText: "全屏",
    exitBtnText: "退出全屏",
  });
  scene.addControl(fullscreen);
  const mapTheme = new MapTheme({});
  scene.addControl(mapTheme);
}