import fs from 'node:fs';
import path from 'node:path';

const sceneDir = path.resolve('assets/scenes');
fs.mkdirSync(sceneDir, { recursive: true });

const APP_TYPE = '5e1ebNXYqJBvZoykzIIMWBn';
const SOLID_SPRITE_FRAME = '7d8f9b89-4fd1-4c9f-a3ab-38ec7cded7ca@f9941';

const uuids = {
  Main: '90c7ec3e-0738-4f92-b924-01a7b7e3fd34',
  Login: '42a62e0e-7792-47ab-811c-df5e68a0a101',
  Register: '5fa1ac3d-62ac-45ad-b5c5-702caa9b47a8',
  Home: '87e8f7cd-88d7-4ad1-9e50-79bf761a6d8a',
  Players: '760f615a-bb7e-48f1-9f5f-42185ef73c95',
  Shop: '6ac08a5f-10cf-4758-bb3f-1b4c53fd0472',
  ShopFormations: '60325eed-0e15-4f0f-a76b-47f78423a019',
  ShopNormalPlayers: '3a25c0ff-418c-4ba2-b543-a64ebb4a1249',
  ShopLegendPlayers: '6edc48d5-170a-4be9-a86e-d5d1430f250e',
  ShopPacks: 'f482b369-4cc5-459f-9407-78e1524960be',
  Profile: '36d99b10-9140-4447-a49a-6d45c8be631f',
  Match: '0dc8c391-967a-4376-a7ed-cdb38d6a99d4',
};

function color(r, g, b, a = 255) {
  return { __type__: 'cc.Color', r, g, b, a };
}

function vec2(x, y) {
  return { __type__: 'cc.Vec2', x, y };
}

function vec3(x, y, z = 0) {
  return { __type__: 'cc.Vec3', x, y, z };
}

function vec4(x, y, z, w) {
  return { __type__: 'cc.Vec4', x, y, z, w };
}

function quat() {
  return { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 };
}

class SceneBuilder {
  constructor(name) {
    this.name = name;
    this.items = [];
    this.id = 0;
    this.nodes = new Map();
    this.createBase();
  }

  ref(id) {
    return { __id__: id };
  }

  push(obj) {
    this.items.push(obj);
    return this.id++;
  }

  createBase() {
    this.assetId = this.push({
      __type__: 'cc.SceneAsset',
      _name: this.name,
      _objFlags: 0,
      _native: '',
      scene: this.ref(1),
    });
    this.sceneId = this.push({
      __type__: 'cc.Scene',
      _name: this.name,
      _objFlags: 0,
      _parent: null,
      _children: [],
      _active: true,
      _components: [],
      _prefab: null,
      autoReleaseAssets: false,
      _globals: this.ref(0),
      _id: uuids[this.name],
    });
    this.canvasId = this.node('Canvas', 195, 422, 0, 0, this.sceneId);
    this.cameraId = this.node('UICamera_Canvas', 0, 0, 0, 0, this.canvasId, 1073741824);
    this.items[this.cameraId]._lpos.z = 1000;
    const cam = this.component('cc.Camera', this.cameraId, {
      _projection: 0,
      _priority: 1073741824,
      _fov: 45,
      _fovAxis: 0,
      _orthoHeight: 422,
      _near: 1,
      _far: 2000,
      _color: color(0, 0, 0, 0),
      _depth: 1,
      _stencil: 0,
      _clearFlags: 0,
      _rect: { __type__: 'cc.Rect', x: 0, y: 0, width: 1, height: 1 },
      _aperture: 19,
      _shutter: 7,
      _iso: 0,
      _screenScale: 1,
      _visibility: 42467328,
      _targetTexture: null,
    });
    this.items[this.cameraId]._components.push(this.ref(cam));
    const ui = this.ui(this.canvasId, 390, 844);
    const canvas = this.component('cc.Canvas', this.canvasId, {
      _cameraComponent: this.ref(cam),
      _alignCanvasWithScreen: true,
    });
    const widget = this.component('cc.Widget', this.canvasId, {
      _alignFlags: 45,
      _target: null,
      _left: 0,
      _right: 0,
      _top: 0,
      _bottom: 0,
      _horizontalCenter: 0,
      _verticalCenter: 0,
      _isAbsLeft: true,
      _isAbsRight: true,
      _isAbsTop: true,
      _isAbsBottom: true,
      _isAbsHorizontalCenter: true,
      _isAbsVerticalCenter: true,
      _originalWidth: 0,
      _originalHeight: 0,
      _alignMode: 2,
      _lockFlags: 0,
    });
    const app = this.component(APP_TYPE, this.canvasId, {});
    this.items[this.canvasId]._components.push(this.ref(ui), this.ref(canvas), this.ref(widget), this.ref(app));
    this.sceneGlobals();
  }

  sceneGlobals() {
    const globals = this.push({ __type__: 'cc.SceneGlobals', ambient: this.ref(this.id + 1), shadows: this.ref(this.id + 2), _skybox: this.ref(this.id + 3), fog: this.ref(this.id + 4), octree: this.ref(this.id + 5), skin: this.ref(this.id + 6) });
    this.items[this.sceneId]._globals = this.ref(globals);
    this.push({ __type__: 'cc.AmbientInfo', _skyColorHDR: vec4(0, 0, 0, 0.520833125), _skyColor: vec4(0, 0, 0, 0.520833125), _skyIllumHDR: 20000, _skyIllum: 20000, _groundAlbedoHDR: vec4(0, 0, 0, 0), _groundAlbedo: vec4(0, 0, 0, 0), _skyColorLDR: vec4(0.2, 0.5, 0.8, 1), _skyIllumLDR: 20000, _groundAlbedoLDR: vec4(0.2, 0.2, 0.2, 1) });
    this.push({ __type__: 'cc.ShadowsInfo', _enabled: false, _type: 0, _normal: vec3(0, 1, 0), _distance: 0, _shadowColor: color(76, 76, 76), _maxReceived: 4, _size: vec2(512, 512) });
    this.push({ __type__: 'cc.SkyboxInfo', _envLightingType: 0, _envmapHDR: null, _envmap: null, _envmapLDR: null, _diffuseMapHDR: null, _diffuseMapLDR: null, _enabled: false, _useHDR: true });
    this.push({ __type__: 'cc.FogInfo', _type: 0, _fogColor: color(200, 200, 200), _enabled: false, _fogDensity: 0.3, _fogStart: 0.5, _fogEnd: 300, _fogAtten: 5, _fogTop: 1.5, _fogRange: 1.2, _accurate: false });
    this.push({ __type__: 'cc.OctreeInfo', _enabled: false, _minPos: vec3(-1024, -1024, -1024), _maxPos: vec3(1024, 1024, 1024), _depth: 8 });
    this.push({ __type__: 'cc.SkinInfo', _enabled: false, _scale: 5 });
  }

  node(name, x, y, w, h, parent = this.canvasId, layer = 33554432) {
    const id = this.push({
      __type__: 'cc.Node',
      _name: name,
      _objFlags: 0,
      _parent: this.ref(parent),
      _children: [],
      _active: true,
      _components: [],
      _prefab: null,
      _lpos: vec3(x, y),
      _lrot: quat(),
      _lscale: vec3(1, 1, 1),
      _layer: layer,
      _euler: vec3(0, 0, 0),
      _id: '',
    });
    this.items[parent]._children.push(this.ref(id));
    this.nodes.set(name, id);
    if (w || h) this.items[id]._components.push(this.ref(this.ui(id, w, h)));
    return id;
  }

  component(type, nodeId, props) {
    return this.push({ __type__: type, _name: '', _objFlags: 0, node: this.ref(nodeId), _enabled: true, __prefab: null, ...props, _id: '' });
  }

  ui(nodeId, width, height) {
    return this.component('cc.UITransform', nodeId, {
      _contentSize: { __type__: 'cc.Size', width, height },
      _anchorPoint: vec2(0.5, 0.5),
    });
  }

  setAnchor(nodeId, x, y) {
    const transformRef = this.items[nodeId]._components.find((component) => this.items[component.__id__]?.__type__ === 'cc.UITransform');
    if (transformRef) this.items[transformRef.__id__]._anchorPoint = vec2(x, y);
  }

  block(name, x, y, w, h, c, parent = this.canvasId) {
    const id = this.node(name, x, y, w, h, parent);
    this.items[id]._components.push(this.ref(this.component('cc.Sprite', id, {
      _customMaterial: null,
      _srcBlendFactor: 2,
      _dstBlendFactor: 4,
      _color: c,
      _spriteFrame: { __uuid__: SOLID_SPRITE_FRAME, __expectedType__: 'cc.SpriteFrame' },
      _type: 0,
      _fillType: 0,
      _sizeMode: 0,
      _fillCenter: vec2(0, 0),
      _fillStart: 0,
      _fillRange: 0,
      _isTrimmedMode: true,
      _useGrayscale: false,
      _atlas: null,
    })));
    return id;
  }

  setSpriteColor(name, c) {
    const id = this.nodes.get(name);
    if (id === undefined) return;
    const spriteRef = this.items[id]._components.find((component) => this.items[component.__id__]?.__type__ === 'cc.Sprite');
    if (spriteRef) this.items[spriteRef.__id__]._color = c;
  }

  text(name, value, x, y, size = 16, c = color(255, 255, 255), parent = this.canvasId, w = 260, h = 36, bold = false) {
    const id = this.node(name, x, y, w, h, parent);
    this.items[id]._components.push(this.ref(this.component('cc.Label', id, {
      _customMaterial: null,
      _srcBlendFactor: 2,
      _dstBlendFactor: 4,
      _color: c,
      _string: value,
      _horizontalAlign: 1,
      _verticalAlign: 1,
      _actualFontSize: size,
      _fontSize: size,
      _fontFamily: 'Arial',
      _lineHeight: size + 6,
      _overflow: 0,
      _enableWrapText: false,
      _font: null,
      _isSystemFontUsed: true,
      _spacingX: 0,
      _isItalic: false,
      _isBold: bold,
      _isUnderline: false,
      _underlineHeight: 2,
      _cacheMode: 2,
    })));
    return id;
  }

  textLeft(name, value, x, y, size = 16, c = color(255, 255, 255), parent = this.canvasId, w = 260, h = 36, bold = false) {
    const id = this.text(name, value, x, y, size, c, parent, w, h, bold);
    const labelRef = this.items[id]._components.find((component) => this.items[component.__id__]?.__type__ === 'cc.Label');
    if (labelRef) this.items[labelRef.__id__]._horizontalAlign = 0;
    return id;
  }

  textTopLeft(name, value, left, top, size = 12, c = color(51, 63, 82), parent = this.canvasId, w = 276, h = 18, bold = false) {
    const id = this.text(name, value, left, top, size, c, parent, w, h, bold);
    this.setAnchor(id, 0, 1);
    const labelRef = this.items[id]._components.find((component) => this.items[component.__id__]?.__type__ === 'cc.Label');
    if (labelRef) {
      this.items[labelRef.__id__]._horizontalAlign = 0;
      this.items[labelRef.__id__]._verticalAlign = 0;
    }
    return id;
  }

  inputBox(name, x, y, w = 276, h = 46, parent = this.canvasId) {
    const id = this.block(name, x, y, w, h, color(255, 255, 255), parent);
    const border = color(184, 196, 212);
    const line = 2;
    this.block(`${name}_BorderTop`, 0, h / 2 - line / 2, w, line, border, id);
    this.block(`${name}_BorderBottom`, 0, -h / 2 + line / 2, w, line, border, id);
    this.block(`${name}_BorderLeft`, -w / 2 + line / 2, 0, line, h, border, id);
    this.block(`${name}_BorderRight`, w / 2 - line / 2, 0, line, h, border, id);
    return id;
  }

  button(name, value, x, y, w, h, c, parent = this.canvasId) {
    const id = this.block(name, x, y, w, h, c, parent);
    this.items[id]._components.push(this.ref(this.component('cc.Button', id, {
      clickEvents: [],
      _interactable: true,
      _transition: 2,
      _normalColor: color(255, 255, 255),
      _hoverColor: color(230, 230, 230),
      _pressedColor: color(210, 210, 210),
      _disabledColor: color(124, 124, 124),
      _normalSprite: { __uuid__: SOLID_SPRITE_FRAME, __expectedType__: 'cc.SpriteFrame' },
      _hoverSprite: { __uuid__: SOLID_SPRITE_FRAME, __expectedType__: 'cc.SpriteFrame' },
      _pressedSprite: { __uuid__: SOLID_SPRITE_FRAME, __expectedType__: 'cc.SpriteFrame' },
      _disabledSprite: { __uuid__: SOLID_SPRITE_FRAME, __expectedType__: 'cc.SpriteFrame' },
      _duration: 0.1,
      _zoomScale: 1.06,
      _target: this.ref(id),
    })));
    this.text(`${name}_Label`, value, 0, 0, 16, color(255, 255, 255), id, w - 12, h, true);
    return id;
  }

  commonShell(active) {
    this.block('Background', 0, 0, 390, 844, color(13, 54, 111));
    this.block('TopBar', 0, 392, 390, 60, color(0, 154, 218));
    this.block('TopAvatar', -160, 392, 34, 34, color(255, 212, 84));
    this.text('TextAvatarInitial', '游', -160, 392, 15, color(18, 54, 97), this.canvasId, 28, 24, true);
    this.textLeft('TextAccount', '游客 10086', -102, 392, 14, color(255, 255, 255), this.canvasId, 128, 30, true);
    this.text('TextBrandShadow', '弹射绿茵', 111, 389, 22, color(0, 78, 132), this.canvasId, 150, 34, true);
    this.text('TextGameTitle', '弹射绿茵', 108, 393, 22, color(255, 237, 96), this.canvasId, 150, 34, true);
    this.block('TabBar', 0, -384, 390, 76, color(111, 55, 205));
    const tabs = [
      ['TabHome', '首页', -146, 'home'],
      ['TabPlayers', '阵容', -49, 'players'],
      ['TabShop', '商店', 49, 'shop'],
      ['TabProfile', '个人中心', 146, 'profile'],
    ];
    for (const [name, label, x, key] of tabs) {
      this.button(name, label, x, -384, 86, 52, key === active ? color(255, 128, 31) : color(111, 55, 205));
    }
  }

  save() {
    fs.writeFileSync(path.join(sceneDir, `${this.name}.scene`), `${JSON.stringify(this.items, null, 2)}\n`);
    fs.writeFileSync(path.join(sceneDir, `${this.name}.scene.meta`), `${JSON.stringify({
      ver: '1.1.50',
      importer: 'scene',
      imported: true,
      uuid: uuids[this.name],
      files: [],
      subMetas: {},
      userData: {},
    }, null, 2)}\n`);
  }
}

function login() {
  const s = new SceneBuilder('Login');
  s.block('Background', 0, 0, 390, 844, color(13, 54, 111));
  s.text('TextTitle', '弹射绿茵', 0, 250, 38, color(245, 249, 255), s.canvasId, 260, 54, true);
  s.text('TextSubtitle', '2D 物理弹射足球', 0, 210, 16, color(143, 158, 180));
  s.block('LoginPanel', 0, -20, 330, 430, color(255, 255, 255));
  s.text('TextLoginTitle', '账号登录', -38, 140, 24, color(30, 39, 54), s.canvasId, 180, 40, true);
  s.button('ButtonRegister', '注册', 114, 140, 58, 34, color(49, 65, 88));
  s.textTopLeft('TextAccountLabel', '账号', -138, 116);
  s.inputBox('InputAccount', 0, 78);
  s.textTopLeft('TextPasswordLabel', '密码', -138, 36);
  s.inputBox('InputPassword', 0, -2);
  s.button('ButtonLogin', '登录', 0, -90, 276, 50, color(36, 162, 94));
  s.button('ButtonGuestLogin', '游客快速登录', 0, -148, 276, 42, color(96, 112, 134));
  s.text('TextHint', '', 0, -204, 13, color(90, 105, 126), s.canvasId, 320, 32);
  s.save();
}

function register() {
  const s = new SceneBuilder('Register');
  s.block('Background', 0, 0, 390, 844, color(13, 54, 111));
  s.text('TextTitle', '弹射绿茵', 0, 282, 38, color(245, 249, 255), s.canvasId, 260, 54, true);
  s.text('TextSubtitle', '创建账号', 0, 244, 16, color(143, 158, 180));
  s.block('RegisterPanel', 0, -20, 330, 460, color(255, 255, 255));
  s.text('TextRegisterTitle', '注册账号', -38, 154, 24, color(30, 39, 54), s.canvasId, 180, 40, true);
  s.button('ButtonBackLogin', '返回', 114, 154, 58, 34, color(49, 65, 88));
  s.textTopLeft('TextRegisterAccountLabel', '账号', -138, 126);
  s.inputBox('InputRegisterAccount', 0, 88);
  s.textTopLeft('TextRegisterPasswordLabel', '密码', -138, 46);
  s.inputBox('InputRegisterPassword', 0, 8);
  s.textTopLeft('TextRegisterConfirmLabel', '确认密码', -138, -34);
  s.inputBox('InputRegisterConfirm', 0, -72);
  s.button('ButtonRegisterSubmit', '确认注册', 0, -154, 276, 50, color(36, 162, 94));
  s.text('TextRegisterHint', '', 0, -214, 13, color(90, 105, 126), s.canvasId, 320, 32);
  s.save();
}

function main() {
  const s = new SceneBuilder('Main');
  s.block('Background', 0, 0, 390, 844, color(13, 54, 111));
  s.text('TextBoot', '加载中', 0, 0, 18, color(245, 249, 255), s.canvasId, 160, 36, true);
  s.save();
}

function home() {
  const s = new SceneBuilder('Home');
  s.commonShell('home');
  s.text('TextPageTitle', '首页', -142, 306, 26, color(245, 249, 255), s.canvasId, 90, 42, true);
  s.button('ButtonAI', '单机人机', -82, 150, 158, 154, color(34, 147, 96));
  s.text('TextAIHint', '本地即时物理\nAI 自动回合', -82, 112, 12, color(223, 238, 230), s.canvasId, 130, 50);
  s.button('ButtonOnline', '真人联机', 82, 150, 158, 154, color(43, 111, 190));
  s.text('TextOnlineHint', '同场景\n预留 WebSocket', 82, 112, 12, color(224, 236, 255), s.canvasId, 130, 50);
  s.text('TextTaskTitle', '今日任务', -126, -35, 18, color(245, 249, 255), s.canvasId, 120, 34, true);
  s.block('TaskRow1', 0, -95, 348, 48, color(27, 38, 54));
  s.text('Task1Left', '完成一局对战', -92, -95, 14, color(229, 236, 246), s.canvasId, 150, 28);
  s.text('Task1Right', '+100 金币', 112, -95, 14, color(154, 176, 205), s.canvasId, 110, 28, true);
  s.block('TaskRow2', 0, -150, 348, 48, color(27, 38, 54));
  s.text('Task2Left', '使用 3 次弹射', -92, -150, 14, color(229, 236, 246), s.canvasId, 150, 28);
  s.text('Task2Right', '+1 训练券', 112, -150, 14, color(154, 176, 205), s.canvasId, 110, 28, true);
  s.save();
}

function players() {
  const s = new SceneBuilder('Players');
  s.commonShell('players');
  s.text('TextPageTitle', '阵容', -142, 306, 26, color(245, 249, 255), s.canvasId, 90, 42, true);
  s.block('FormationBoard', 0, 102, 348, 360, color(30, 105, 66));
  [[-45, -62], [45, -62], [-40, 45], [40, 45], [0, 152]].forEach(([x, y], i) => {
    s.block(`Starter_${i + 1}`, x, y + 102, 42, 42, color(238, 77, 77));
    s.text(`StarterText_${i + 1}`, String(i + 1), x, y + 71, 11, color(255, 255, 255), s.canvasId, 62, 22, true);
  });
  s.block('FormationCarouselViewport', 0, -140, 348, 92, color(27, 78, 142));
  s.block('FormationSelectorFrame', 0, -140, 104, 78, color(0, 0, 0, 0));
  s.block('PlayerListViewport', 0, -270, 358, 148, color(18, 70, 132));
  s.save();
}

function shop() {
  const s = new SceneBuilder('Shop');
  s.commonShell('shop');
  s.text('TextPageTitle', '商店', -142, 306, 26, color(245, 249, 255), s.canvasId, 90, 42, true);
  s.text('TextCoins', '金币 1280', 114, 306, 15, color(255, 205, 84), s.canvasId, 120, 32, true);
  shopCategoryButton(s, 'ButtonShopFormations', '球队阵型', 176, color(255, 128, 31));
  shopCategoryButton(s, 'ButtonShopNormalPlayers', '普通球员', 72, color(0, 185, 224));
  shopCategoryButton(s, 'ButtonShopLegendPlayers', '传奇球员', -32, color(180, 72, 232));
  shopCategoryButton(s, 'ButtonShopOther', '抽球', -136, color(38, 207, 132));
  s.save();
}

function shopCategoryButton(s, name, label, y, c) {
  s.block(`${name}_Shadow`, 0, y - 9, 330, 82, color(8, 30, 76, 168));
  const id = s.button(name, '', 0, y, 330, 82, c);
  s.block(`${name}_TopGlow`, 0, 23, 304, 16, color(255, 255, 255, 54), id);
  s.text(`${name}_ArtShadow`, label, 3, -2, 28, color(17, 64, 118, 180), id, 250, 44, true);
  s.text(`${name}_ArtText`, label, 0, 2, 28, color(255, 246, 130), id, 250, 44, true);
}

function shopListScene(name, title) {
  const s = new SceneBuilder(name);
  s.commonShell('shop');
  s.text('TextPageTitle', title, -98, 306, 26, color(245, 249, 255), s.canvasId, 150, 42, true);
  s.text('TextShopCoins', '金币 1280', 55, 306, 16, color(255, 205, 84), s.canvasId, 96, 32, true);
  s.button('ButtonBackShop', '返回', 132, 306, 70, 36, color(255, 128, 31));
  s.block('ShopListViewport', 0, -25, 358, 560, color(18, 70, 132));
  s.save();
}

function shopPackScene() {
  const s = new SceneBuilder('ShopPacks');
  s.commonShell('shop');
  s.text('TextPageTitle', '抽球', -98, 306, 26, color(245, 249, 255), s.canvasId, 150, 42, true);
  s.text('TextShopCoins', '金币 1280', 55, 306, 16, color(255, 205, 84), s.canvasId, 96, 32, true);
  s.button('ButtonBackShop', '返回', 132, 306, 70, 36, color(255, 128, 31));
  [
    ['烈焰巨星包', -88, 174, color(255, 83, 59)],
    ['星河控场包', 88, 174, color(122, 91, 255)],
    ['闪电突击包', -88, -86, color(0, 207, 224)],
    ['钢铁防线包', 88, -86, color(255, 174, 49)],
  ].forEach(([label, x, y, c], index) => {
    const card = s.block(`PackCard_${index}`, x, y, 166, 226, color(13, 46, 94));
    s.block(`PackCover_${index}`, 0, 44, 138, 104, c, card);
    s.text(`PackName_${index}`, label, 0, -24, 16, color(255, 246, 130), card, 148, 28, true);
    s.text(`PackInfo_${index}`, '红5 橙5 紫10 蓝20', 0, -50, 11, color(210, 228, 255), card, 150, 22, true);
    s.button(`ButtonPackSingle_${index}`, '单抽100', -43, -88, 72, 34, color(255, 128, 31), card);
    s.button(`ButtonPackTen_${index}`, '十连抽1000', 39, -88, 84, 34, color(180, 72, 232), card);
  });
  s.save();
}

function profile() {
  const s = new SceneBuilder('Profile');
  s.commonShell('profile');
  s.text('TextPageTitle', '个人中心', -112, 306, 26, color(245, 249, 255), s.canvasId, 140, 42, true);
  s.block('Avatar', -112, 150, 84, 84, color(66, 132, 210));
  s.text('TextName', '游客 10086', 10, 172, 22, color(245, 249, 255), s.canvasId, 160, 34, true);
  s.text('TextAccountStatus', '游客账户  |  暂未绑定手机', 26, 142, 14, color(154, 176, 205), s.canvasId, 230, 28);
  [['查看账户信息', 42], ['更改名称 / 密码 / 头像', -16], ['切换账户', -74]].forEach(([label, y]) => {
    s.block(`ProfileRow_${label}`, 0, y, 348, 48, color(27, 38, 54));
    s.text(`Text_${label}`, label, -70, y, 14, color(229, 236, 246), s.canvasId, 210, 28);
    s.text(`Arrow_${label}`, '>', 142, y, 14, color(154, 176, 205), s.canvasId, 30, 28, true);
  });
  s.button('ButtonLogout', '退出到登录页', 0, -210, 334, 46, color(117, 53, 62));
  s.save();
}

function match() {
  const s = new SceneBuilder('Match');
  s.block('Background', 0, 0, 390, 844, color(17, 23, 33));
  s.text('TextMode', '单机人机', 0, 386, 20, color(245, 249, 255), s.canvasId, 160, 34, true);
  s.button('ButtonBackHome', '返回', -150, 386, 62, 34, color(49, 65, 88));
  s.text('TextScore', '0 : 0', 0, 356, 18, color(245, 249, 255), s.canvasId, 100, 30, true);
  s.text('TextTurn', '我方回合', 108, 356, 14, color(154, 176, 205), s.canvasId, 120, 28);
  const pitch = s.block('Pitch', 0, -18, 362, 650, color(138, 190, 72));
  s.block('TopWallLeft', -122, 288, 118, 38, color(27, 48, 64), pitch);
  s.block('TopWallRight', 122, 288, 118, 38, color(27, 48, 64), pitch);
  s.block('BottomWallLeft', -122, -288, 118, 38, color(27, 48, 64), pitch);
  s.block('BottomWallRight', 122, -288, 118, 38, color(27, 48, 64), pitch);
  s.block('MidLine', 0, 0, 348, 3, color(219, 245, 222), pitch);
  s.block('CenterCircleHint', 0, 0, 112, 112, color(46, 150, 86, 120), pitch);
  s.block('TopBox', 0, 240, 148, 72, color(46, 150, 86, 150), pitch);
  s.block('BottomBox', 0, -240, 148, 72, color(46, 150, 86, 150), pitch);
  s.block('TopGoal', 0, 306, 126, 10, color(255, 255, 255), pitch);
  s.block('BottomGoal', 0, -306, 126, 10, color(255, 255, 255), pitch);
  [['home-1', 0, -221], ['home-2', -80, -150], ['home-3', 80, -150], ['home-4', -58, -58], ['home-5', 58, -58]].forEach(([id, x, y]) => s.block(`Player_${id}`, x, y, 40, 40, color(238, 77, 77), pitch));
  [['away-1', 0, 221], ['away-2', -80, 150], ['away-3', 80, 150], ['away-4', -58, 58], ['away-5', 58, 58]].forEach(([id, x, y]) => s.block(`Player_${id}`, x, y, 40, 40, color(74, 135, 232), pitch));
  s.block('Ball', 0, 0, 26, 26, color(246, 246, 235), pitch);
  s.save();
}

[main, login, register, home, players, shop, () => shopListScene('ShopFormations', '球队阵型'), () => shopListScene('ShopNormalPlayers', '普通球员'), () => shopListScene('ShopLegendPlayers', '传奇球员'), shopPackScene, profile, match].forEach((fn) => fn());
