import Bitmap from "./skin/Bitmap";
import { XmlElement } from "@rgrove/parse-xml";
import TrueTypeFont from "./skin/TrueTypeFont";
import { assert, assume } from "./utils";
import BitmapFont from "./skin/BitmapFont";
import Color from "./skin/Color";
import GammaGroup from "./skin/GammaGroup";
import Container from "./skin/Container";
import Vm from "./skin/VM";
import BaseObject from "./skin/BaseObject";
import AudioPlayer from "./skin/AudioPlayer";

export class UIRoot {
  // Just a temporary place to stash things
  _bitmaps: Bitmap[] = [];
  _fonts: (TrueTypeFont | BitmapFont)[] = [];
  _colors: Color[] = [];
  _groupDefs: XmlElement[] = [];
  _gammaSets: Map<string, GammaGroup[]> = new Map();
  _xuiElements: XmlElement[] = [];
  _activeGammaSet: GammaGroup[] | null = null;
  _containers: Container[] = [];

  // A list of all objects created for this skin.
  _objects: BaseObject[] = [];

  vm: Vm = new Vm();
  audio: AudioPlayer = new AudioPlayer();

  reset() {
    this.dispose();
    this._bitmaps = [];
    this._fonts = [];
    this._colors = [];
    this._groupDefs = [];
    this._gammaSets = new Map();
    this._xuiElements = [];
    this._activeGammaSet = null;
    this._containers = [];

    // A list of all objects created for this skin.
    this._objects = [];

    this.vm = new Vm();
    this.audio = new AudioPlayer();
  }

  addObject(obj: BaseObject) {
    this._objects.push(obj);
  }

  addBitmap(bitmap: Bitmap) {
    this._bitmaps.push(bitmap);
  }

  // TODO: Maybe return a default bitmap?
  getBitmap(id: string): Bitmap {
    const lowercaseId = id.toLowerCase();
    const found = this._bitmaps.find(
      (bitmap) => bitmap._id.toLowerCase() === lowercaseId
    );

    assert(found != null, `Could not find bitmap with id ${id}.`);
    return found;
  }

  addFont(font: TrueTypeFont | BitmapFont) {
    this._fonts.push(font);
  }

  addColor(color: Color) {
    this._colors.push(color);
  }

  getColor(id: string): Color {
    const lowercaseId = id.toLowerCase();
    const found = this._colors.find(
      (color) => color._id.toLowerCase() === lowercaseId
    );

    assert(found != null, `Could not find color with id ${id}.`);
    return found;
  }

  getFont(id: string): TrueTypeFont | BitmapFont | null {
    const found = this._fonts.find(
      (font) => font.getId().toLowerCase() === id.toLowerCase()
    );

    if (found == null) {
      console.warn(`Could not find true type font with id ${id}.`);
    }
    return found ?? null;
  }

  addGroupDef(groupDef: XmlElement) {
    this._groupDefs.push(groupDef);
    if (groupDef.attributes.xuitag) {
      this._xuiElements.push(groupDef);
    }
  }

  getGroupDef(id: string): XmlElement | null {
    const lowercaseId = id.toLowerCase();
    const found = this._groupDefs.find(
      (def) => def.attributes.id.toLowerCase() === lowercaseId
    );

    return found ?? null;
  }

  addContainers(container: Container) {
    this._containers.push(container);
  }

  getContainers(): Container[] {
    return this._containers;
  }

  addGammaSet(id: string, gammaSet: GammaGroup[]) {
    this._gammaSets.set(id.toLowerCase(), gammaSet);
  }

  enableGammaSet(id: string) {
    const found = this._gammaSets.get(id.toLowerCase());
    assume(
      found != null,
      `Could not find gammaset for id "${id}" from set of ${Array.from(
        this._gammaSets.keys()
      ).join(", ")}`
    );
    this._activeGammaSet = found;
    this._setCssVars();
  }

  enableDefaultGammaSet() {
    const found = Array.from(this._gammaSets.values())[0];
    assume(
      found != null,
      `Could not find default gammaset from set of ${Array.from(
        this._gammaSets.keys()
      ).join(", ")}`
    );
    this._activeGammaSet = found;
    this._setCssVars();
  }

  _getGammaGroup(id: string): GammaGroup {
    const lower = id.toLowerCase();
    const found = this._activeGammaSet.find((gammaGroup) => {
      return gammaGroup.getId().toLowerCase() === lower;
    });
    assume(
      found != null,
      `Cold not find a gammagroup for "${id}" from ${Array.from(
        this._gammaSets.keys()
      ).join(", ")}`
    );
    return found;
  }

  _setCssVars() {
    const map = new Map();
    for (const bitmap of this._bitmaps) {
      const img = bitmap.getImg();
      const groupId = bitmap.getGammaGroup();
      if (!map.has(img)) {
        map.set(img, new Map());
      }
      const imgCache = map.get(img);
      if (!imgCache.has(groupId)) {
        const gammaGroup =
          groupId != null ? this._getGammaGroup(groupId) : null;
        const url =
          gammaGroup == null ? img.src : gammaGroup.transformImage(img);
        imgCache.set(groupId, url);
      }
      const url = imgCache.get(groupId);
      // TODO: Techincally we only need one per image/gammagroup.
      document.documentElement.style.setProperty(
        bitmap.getCSSVar(),
        `url(${url})`
      );
    }
  }

  getXuiElement(name: string): XmlElement | null {
    const lowercaseName = name.toLowerCase();
    const found = this._xuiElements.find(
      (def) => def.attributes.xuitag.toLowerCase() === lowercaseName
    );

    return found ?? null;
  }

  dispatch(action: string, param: string | null, actionTarget: string | null) {
    switch (action) {
      case "PLAY":
        this.audio.play();
        break;
      case "PAUSE":
        this.audio.pause();
        break;
      case "STOP":
        this.audio.stop();
        break;
      case "NEXT":
        this.audio.next();
        break;
      case "PREV":
        this.audio.previous();
        break;
      case "EJECT":
        this.audio.eject();
        break;
      default:
        assume(false, `Unknown global action: ${action}`);
    }
  }

  dispose() {
    for (const obj of this._objects) {
      obj.dispose();
    }
  }
}

// Global Singleton for now
let UI_ROOT = new UIRoot();
export default UI_ROOT;
