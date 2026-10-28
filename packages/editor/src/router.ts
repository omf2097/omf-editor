import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import { useDocument } from './composables/useDocument';
import { lastAnimationId } from './composables/useSelection';
import { animationsOf } from './lib/doc';

declare module 'vue-router' {
  interface RouteMeta {
    /** Without an open document the guard sends the user to the Start view. */
    needsDoc?: boolean;
    /** Only scenes have it; with a fighter open the guard goes to the File view. */
    bkOnly?: boolean;
  }
}

// Route names are used by navigation code and tests; keep them stable.
const routes: RouteRecordRaw[] = [
  { path: '/', name: 'start', component: () => import('./views/StartView.vue') },
  {
    path: '/file',
    name: 'file',
    component: () => import('./views/FileView.vue'),
    meta: { needsDoc: true },
  },
  {
    path: '/animations',
    name: 'animations',
    meta: { needsDoc: true },
    redirect: () => {
      const { doc } = useDocument();
      const ids = doc.value ? [...animationsOf(doc.value).keys()] : [];
      const id =
        lastAnimationId.value !== null && ids.includes(lastAnimationId.value)
          ? lastAnimationId.value
          : ids[0];
      return id === undefined
        ? { name: 'animations-empty' }
        : { name: 'anim-overview', params: { id } };
    },
  },
  {
    path: '/animations/none',
    name: 'animations-empty',
    meta: { needsDoc: true },
    component: () => import('./views/AnimationLayout.vue'),
  },
  {
    path: '/animations/:id(\\d+)',
    component: () => import('./views/AnimationLayout.vue'),
    meta: { needsDoc: true },
    children: [
      { path: '', name: 'anim-overview', component: () => import('./views/OverviewView.vue') },
      { path: 'script', name: 'anim-script', component: () => import('./views/ScriptView.vue') },
      { path: 'sprites', name: 'anim-sprites', component: () => import('./views/SpritesView.vue') },
      {
        path: 'sprites/:n(\\d+)/edit',
        name: 'anim-pixels',
        component: () => import('./views/PixelEditorView.vue'),
      },
      {
        path: 'collisions',
        name: 'anim-collisions',
        component: () => import('./views/CollisionsView.vue'),
      },
    ],
  },
  {
    path: '/palettes',
    name: 'palettes',
    component: () => import('./views/PalettesView.vue'),
    meta: { needsDoc: true },
  },
  {
    path: '/background',
    name: 'background',
    component: () => import('./views/BackgroundView.vue'),
    meta: { needsDoc: true, bkOnly: true },
  },
  {
    path: '/problems',
    name: 'problems',
    component: () => import('./views/ProblemsView.vue'),
    meta: { needsDoc: true },
  },
  { path: '/reference', name: 'reference', component: () => import('./views/ReferenceView.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

/** Route requested before a document was open; restored after opening (spec 17 §3.1). */
export let pendingRoute: string | null = null;
export const clearPendingRoute = (): void => {
  pendingRoute = null;
};

export const router = createRouter({ history: createWebHashHistory(), routes });

// Routes that cannot be shown for the open document go somewhere that can:
// no document → Start, a fighter on a scene-only view → File, an animation id
// the document does not have → #/animations (the last or first animation).
router.beforeEach((to) => {
  const { doc, kind } = useDocument();
  if (to.meta.needsDoc && !doc.value) {
    // #/animations resolves to the empty list without a document: keep what was asked for.
    pendingRoute = to.redirectedFrom?.fullPath ?? to.fullPath;
    return { name: 'start' };
  }
  if (to.meta.bkOnly && kind.value !== 'bk') return { name: 'file' };
  if (to.params.id !== undefined && doc.value) {
    const id = Number(to.params.id);
    if (!animationsOf(doc.value).has(id)) return { name: 'animations' };
  }
  return true;
});

// Any document view reached (after open, new, import or restore) uses up the pending route.
router.afterEach((to) => {
  if (useDocument().doc.value && to.name !== 'start') pendingRoute = null;
});
