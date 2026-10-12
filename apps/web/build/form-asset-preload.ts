import type { Plugin } from 'vite';
import {
  CHUNK_BY_TYPE,
  CONTROL_MODULES,
  RATING_ICONS_CHUNK,
} from '../src/features/form-renderer/controls/control-chunks.ts';
import { beforeStylesheets, chunkGraph } from './route-preload.ts';

interface Asset {
  type: 'asset';
  fileName: string;
  originalFileNames?: readonly string[];
}

/** A font's built files: its stylesheets, and its Latin files by weight (0: variable). */
export type FontFiles = [css: string[], files: [weight: number, file: string][]];

/** What the script needs to know about the build. File names are relative to `base`. */
export interface FormAssets {
  base: string;
  fonts: Record<string, FontFiles>;
  /** The chunk that adds a font's stylesheets (font-loaders.ts). */
  fontLoaders: string;
  /** Each control chunk's files, by chunk id (see control-chunks.ts). */
  controls: Record<string, string[]>;
  /** Which control chunk draws each question type. */
  chunkByType: Record<string, string>;
  /** The control chunk for ratings drawn as icons. */
  ratingIcons: string;
  /** The conversational layout's files. */
  conversational: string[];
}

const STYLESHEET = /@fontsource(?:-variable)?\/([a-z0-9-]+)\/(?:index|\d{3})\.css$/;
const LATIN_FILE =
  /@fontsource(?:-variable)?\/([a-z0-9-]+)\/files\/([a-z0-9-]+)-latin-(wght|\d{3})-normal\.woff2$/;

/**
 * Every theme font in the build, by font id (the Fontsource package's name, as in
 * src/features/form-renderer/theme/font-loaders.ts). Inter's stylesheet is in the app's own.
 */
export function themeFontFiles(assets: readonly Asset[]): Record<string, FontFiles> {
  const fonts: Record<string, FontFiles> = {};
  const font = (id: string) => (fonts[id] ??= [[], []]);
  for (const asset of assets) {
    for (const original of asset.originalFileNames ?? []) {
      const path = original.replaceAll('\\', '/');
      const stylesheet = STYLESHEET.exec(path);
      if (stylesheet?.[1]) font(stylesheet[1])[0].push(asset.fileName);
      const file = LATIN_FILE.exec(path);
      if (file?.[1] && file[1] === file[2]) {
        font(file[1])[1].push([file[3] === 'wght' ? 0 : Number(file[3]), asset.fileName]);
      }
    }
  }
  return Object.fromEntries(
    Object.entries(fonts)
      // Files without a stylesheet of their own belong to the fonts for other alphabets, which
      // load with a language (see SCRIPT_FONTS in form-view.tsx), never as a theme's.
      .filter(([id, [css]]) => css.length > 0 || id === 'inter')
      .map(([id, [css, files]]) => [
        id,
        [css.sort(), files.sort((a, b) => a[0] - b[0])] satisfies FontFiles,
      ]),
  );
}

/**
 * The script index.html runs on a public form. As soon as the form arrives (index.html asks
 * for it before the app has loaded, as `__formyxPrefetch`), it preloads what drawing the form
 * waits for, which would otherwise only be found once the form's own code had run:
 * - the theme's heading and body fonts, in the weights the form waits for (themeFontsReady);
 * - the chunks of the controls its questions need (preloadFieldControls);
 * - the conversational layout, for a form shown a question at a time (preloadFormLayout).
 */
export function formAssetScript(assets: FormAssets): string {
  const { base, ...data } = assets;
  return `(function(){var p=window.__formyxPrefetch;if(!p)return;var b=${JSON.stringify(base)},d=${JSON.stringify(data)},s={};
function add(rel,href,as){if(s[href])return;s[href]=1;var l=document.createElement('link');l.rel=rel;l.href=b+href;if(as)l.setAttribute('as',as);if(as==='font')l.type='font/woff2';l.crossOrigin='';document.head.appendChild(l)}
function code(files){files.forEach(function(f){add('modulepreload',f)})}
p.response.then(function(r){return r.ok?r.clone().json():null}).then(function(form){var theme=form&&form.theme;if(!theme)return;var t=theme.typography,loaders=0;
if(t)[[t.headingFont,t.headingWeight||400],[t.bodyFont,400]].forEach(function(x){var font=d.fonts[x[0]];if(!font)return;if(font[0].length)loaders=1;
font[0].forEach(function(c){add('preload',c,'style')});var best=null;
font[1].forEach(function(w){if(!best||Math.abs(w[0]-x[1])<=Math.abs(best[0]-x[1]))best=w});if(best)add('preload',best[1],'font')});
if(loaders)add('modulepreload',d.fontLoaders);
var fields=form.schema&&form.schema.fields;if(fields)fields.forEach(function(f){var c=f.type==='rating'?(f.ratingStyle&&f.ratingStyle!=='numbers'?d.ratingIcons:null):d.chunkByType[f.type];if(c&&d.controls[c])code(d.controls[c])});
if(theme.layout&&theme.layout.mode==='conversational')code(d.conversational)})['catch'](function(){})})();`;
}

interface Modules {
  /** The public form page, whose code index.html already preloads (see routePreload). */
  route: string;
  fontLoaders: string;
  controlsDir: string;
  conversational: string;
}

/** Adds `formAssetScript` to index.html, with the build's file names. */
export function formAssetPreload(modules: Modules): Plugin {
  let base = '/';
  return {
    name: 'formyx:form-asset-preload',
    apply: 'build',
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, context) {
        const bundle = context.bundle;
        if (!bundle) return html;
        const { withImports, chunkFor, entryFiles } = chunkGraph(bundle);
        // Files the entry or the page's own preloads already ask for.
        const loaded = withImports(chunkFor(modules.route), new Set(entryFiles));
        const files = (module: string) =>
          [...withImports(chunkFor(module))].filter((file) => !loaded.has(file));

        const fonts = themeFontFiles(
          Object.values(bundle).filter(
            (output): output is typeof output & Asset => output.type === 'asset',
          ),
        );
        if (!fonts.inter || Object.keys(fonts).length < 2) {
          throw new Error('form-asset-preload: theme fonts not found in the build');
        }
        const controls = Object.fromEntries(
          Object.entries(CONTROL_MODULES).map(([id, module]) => [
            id,
            files(`${modules.controlsDir}/${module}.tsx`),
          ]),
        );
        const script = formAssetScript({
          base,
          fonts,
          fontLoaders: chunkFor(modules.fontLoaders).fileName,
          controls,
          chunkByType: CHUNK_BY_TYPE,
          ratingIcons: RATING_ICONS_CHUNK,
          conversational: files(modules.conversational),
        });
        return beforeStylesheets(html, script);
      },
    },
  };
}
