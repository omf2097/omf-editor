// Bootstrap Icons used by the app, inlined at build time (no icon font, no network).
import arrowCounterclockwise from 'bootstrap-icons/icons/arrow-counterclockwise.svg?raw';
import arrowClockwise from 'bootstrap-icons/icons/arrow-clockwise.svg?raw';
import save from 'bootstrap-icons/icons/save.svg?raw';
import folder2Open from 'bootstrap-icons/icons/folder2-open.svg?raw';
import circleHalf from 'bootstrap-icons/icons/circle-half.svg?raw';
import playFill from 'bootstrap-icons/icons/play-fill.svg?raw';
import pauseFill from 'bootstrap-icons/icons/pause-fill.svg?raw';
import stopFill from 'bootstrap-icons/icons/stop-fill.svg?raw';
import volumeUp from 'bootstrap-icons/icons/volume-up.svg?raw';
import volumeMute from 'bootstrap-icons/icons/volume-mute.svg?raw';
import skipStartFill from 'bootstrap-icons/icons/skip-start-fill.svg?raw';
import skipEndFill from 'bootstrap-icons/icons/skip-end-fill.svg?raw';
import skipBackwardFill from 'bootstrap-icons/icons/skip-backward-fill.svg?raw';
import skipForwardFill from 'bootstrap-icons/icons/skip-forward-fill.svg?raw';
import repeat from 'bootstrap-icons/icons/repeat.svg?raw';
import repeat1 from 'bootstrap-icons/icons/repeat-1.svg?raw';
import plusLg from 'bootstrap-icons/icons/plus-lg.svg?raw';
import trash from 'bootstrap-icons/icons/trash.svg?raw';
import exclamationTriangle from 'bootstrap-icons/icons/exclamation-triangle.svg?raw';
import exclamationOctagon from 'bootstrap-icons/icons/exclamation-octagon.svg?raw';
import infoCircle from 'bootstrap-icons/icons/info-circle.svg?raw';
import xLg from 'bootstrap-icons/icons/x-lg.svg?raw';
import zoomIn from 'bootstrap-icons/icons/zoom-in.svg?raw';
import zoomOut from 'bootstrap-icons/icons/zoom-out.svg?raw';
import arrowRight from 'bootstrap-icons/icons/arrow-right.svg?raw';
import pencil from 'bootstrap-icons/icons/pencil.svg?raw';
import eraser from 'bootstrap-icons/icons/eraser.svg?raw';
import paintBucket from 'bootstrap-icons/icons/paint-bucket.svg?raw';
import eyedropper from 'bootstrap-icons/icons/eyedropper.svg?raw';
import square from 'bootstrap-icons/icons/square.svg?raw';
import slashLg from 'bootstrap-icons/icons/slash-lg.svg?raw';
import boundingBox from 'bootstrap-icons/icons/bounding-box.svg?raw';
import arrowsMove from 'bootstrap-icons/icons/arrows-move.svg?raw';
import symmetryVertical from 'bootstrap-icons/icons/symmetry-vertical.svg?raw';
import symmetryHorizontal from 'bootstrap-icons/icons/symmetry-horizontal.svg?raw';
import arrowRepeat from 'bootstrap-icons/icons/arrow-repeat.svg?raw';
import upload from 'bootstrap-icons/icons/upload.svg?raw';
import download from 'bootstrap-icons/icons/download.svg?raw';
import files from 'bootstrap-icons/icons/files.svg?raw';
import arrowUp from 'bootstrap-icons/icons/arrow-up.svg?raw';
import arrowDown from 'bootstrap-icons/icons/arrow-down.svg?raw';
import threeDotsVertical from 'bootstrap-icons/icons/three-dots-vertical.svg?raw';
import layoutSidebar from 'bootstrap-icons/icons/layout-sidebar.svg?raw';
import crosshair from 'bootstrap-icons/icons/crosshair.svg?raw';
import grid3x3 from 'bootstrap-icons/icons/grid-3x3.svg?raw';
import image from 'bootstrap-icons/icons/image.svg?raw';
import arrowLeftRight from 'bootstrap-icons/icons/arrow-left-right.svg?raw';
import bullseye from 'bootstrap-icons/icons/bullseye.svg?raw';
import chevronDown from 'bootstrap-icons/icons/chevron-down.svg?raw';
import chevronRight from 'bootstrap-icons/icons/chevron-right.svg?raw';
import fileEarmarkPlus from 'bootstrap-icons/icons/file-earmark-plus.svg?raw';
import clockHistory from 'bootstrap-icons/icons/clock-history.svg?raw';
import backspace from 'bootstrap-icons/icons/backspace.svg?raw';
import arrowsAngleExpand from 'bootstrap-icons/icons/arrows-angle-expand.svg?raw';
import arrowReturnRight from 'bootstrap-icons/icons/arrow-return-right.svg?raw';
import search from 'bootstrap-icons/icons/search.svg?raw';
import check2 from 'bootstrap-icons/icons/check2.svg?raw';
import codeSlash from 'bootstrap-icons/icons/code-slash.svg?raw';
import fonts from 'bootstrap-icons/icons/fonts.svg?raw';
import fullscreen from 'bootstrap-icons/icons/fullscreen.svg?raw';
import fullscreenExit from 'bootstrap-icons/icons/fullscreen-exit.svg?raw';

export const ICONS = {
  undo: arrowCounterclockwise,
  redo: arrowClockwise,
  save,
  open: folder2Open,
  theme: circleHalf,
  play: playFill,
  pause: pauseFill,
  first: skipStartFill,
  last: skipEndFill,
  prev: skipBackwardFill,
  next: skipForwardFill,
  loop: repeat,
  hold: repeat1,
  plus: plusLg,
  trash,
  warning: exclamationTriangle,
  error: exclamationOctagon,
  info: infoCircle,
  close: xLg,
  zoomIn,
  zoomOut,
  goto: arrowRight,
  pencil,
  eraser,
  fill: paintBucket,
  picker: eyedropper,
  rect: square,
  line: slashLg,
  select: boundingBox,
  move: arrowsMove,
  flipH: symmetryVertical,
  flipV: symmetryHorizontal,
  rotate: arrowRepeat,
  upload,
  download,
  copy: files,
  up: arrowUp,
  down: arrowDown,
  menu: threeDotsVertical,
  sidebar: layoutSidebar,
  origin: crosshair,
  grid: grid3x3,
  image,
  flip: arrowLeftRight,
  hits: bullseye,
  chevronDown,
  chevronRight,
  newFile: fileEarmarkPlus,
  recent: clockHistory,
  backspace,
  resize: arrowsAngleExpand,
  link: arrowReturnRight,
  search,
  check: check2,
  stop: stopFill,
  sound: volumeUp,
  mute: volumeMute,
  fieldCodes: codeSlash,
  textSize: fonts,
  fullscreen,
  fullscreenExit,
} as const;

export type IconName = keyof typeof ICONS;
