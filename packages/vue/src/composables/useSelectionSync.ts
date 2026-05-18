/**
 * Selection-overlay composable — owns the text-caret blink + selection-
 * rect painter (`updateSelectionOverlay`), the cleanup
 * (`clearOverlay`), and the lifecycle for the caret blink interval.
 *
 * The parent still owns the `onSelectionUpdate` callback that the
 * editor view dispatches into, because `useDocxEditor` consumes it at
 * construction time — but the parent's body delegates the overlay
 * repaint to `updateSelectionOverlay` from this composable.
 *
 * Writes back into `selectedImage` (from `useImageActions`) when the
 * PM doc holds a NodeSelection on an image — the overlay rerolls the
 * image's bounding box after layout repaints so resize / move / rotate
 * gestures keep their handles anchored.
 */

import { onBeforeUnmount, type Ref, type ShallowRef } from 'vue';
import type { EditorView } from 'prosemirror-view';
import { NodeSelection } from 'prosemirror-state';
import {
  getSelectionRectsFromDom,
  getCaretPositionFromDom,
} from '@eigenpal/docx-editor-core/layout-bridge/clickToPositionDom';
import { findImageElement } from '@eigenpal/docx-editor-core/layout-painter';
import type { ImageSelectionInfo } from '../components/imageSelectionTypes';
import { Z_INDEX } from '../styles/zIndex';

export interface UseSelectionSyncOptions {
  editorView: Ref<EditorView | null>;
  pagesRef: Ref<HTMLElement | null>;
  selectedImage: ShallowRef<ImageSelectionInfo | null>;
}

export interface UseSelectionSyncReturn {
  clearOverlay: () => void;
  updateSelectionOverlay: () => void;
}

export function useSelectionSync(opts: UseSelectionSyncOptions): UseSelectionSyncReturn {
  let caretBlinkInterval: ReturnType<typeof setInterval> | null = null;
  let caretEl: HTMLElement | null = null;

  function clearOverlay() {
    const container = opts.pagesRef.value;
    if (!container) return;
    container.querySelectorAll('.vue-sel-rect, .vue-caret').forEach((el) => el.remove());
    if (caretBlinkInterval !== null) {
      clearInterval(caretBlinkInterval);
      caretBlinkInterval = null;
    }
    caretEl = null;
  }

  function updateSelectionOverlay() {
    const container = opts.pagesRef.value;
    const view = opts.editorView.value;
    if (!container || !view) return;

    clearOverlay();

    // Keep `selectedImage` in sync with the PM selection: when the doc holds a
    // NodeSelection on an image (e.g. the overlay just re-selected it after a
    // resize / move / rotate that re-painted the pages), re-resolve to the fresh
    // painted element. Mirrors React's PagedEditor selection handler. A PM
    // position can carry `data-pm-start` on more than one painted element (the
    // image's wrapper plus, say, the run span beside it), so scan the matches
    // and take the one that resolves to an actual image wrapper.
    const sel = view.state.selection;
    if (sel instanceof NodeSelection && sel.node.type.name === 'image') {
      let imgEl: HTMLElement | null = null;
      for (const el of container.querySelectorAll<HTMLElement>(`[data-pm-start="${sel.from}"]`)) {
        const img = findImageElement(el);
        if (img) {
          imgEl = img;
          break;
        }
      }
      if (imgEl) {
        const prev = opts.selectedImage.value;
        if (
          !prev ||
          prev.element !== imgEl ||
          prev.pmPos !== sel.from ||
          prev.width !== imgEl.offsetWidth ||
          prev.height !== imgEl.offsetHeight
        ) {
          opts.selectedImage.value = {
            element: imgEl,
            pmPos: sel.from,
            width: imgEl.offsetWidth,
            height: imgEl.offsetHeight,
          };
        }
        return;
      }
    }

    // Skip text/caret overlay when an image is selected — ImageSelectionOverlay handles it
    if (opts.selectedImage.value) return;

    const { from, to, empty } = view.state.selection;

    // Account for scroll offset: overlays are position:absolute inside the
    // scrollable container, so we need to add scrollTop/scrollLeft to convert
    // viewport-relative coordinates from getBoundingClientRect to container-relative.
    const scrollTop = container.scrollTop;
    const scrollLeft = container.scrollLeft;

    if (empty) {
      // Draw blinking caret
      const overlayRect = container.getBoundingClientRect();
      const caret = getCaretPositionFromDom(container, from, overlayRect);
      if (caret) {
        const el = document.createElement('div');
        el.className = 'vue-caret';
        el.style.cssText = `
          position: absolute;
          left: ${caret.x + scrollLeft}px;
          top: ${caret.y + scrollTop}px;
          width: 2px;
          height: ${caret.height}px;
          background: #000;
          pointer-events: none;
          z-index: ${Z_INDEX.selectionOverlay};
        `;
        container.appendChild(el);
        caretEl = el;

        // Blink
        let visible = true;
        caretBlinkInterval = setInterval(() => {
          visible = !visible;
          if (caretEl) caretEl.style.opacity = visible ? '1' : '0';
        }, 530);
      }
      return;
    }

    // Draw selection highlight rects (character-level)
    const overlayRect = container.getBoundingClientRect();
    const rects = getSelectionRectsFromDom(container, from, to, overlayRect);

    for (const rect of rects) {
      const el = document.createElement('div');
      el.className = 'vue-sel-rect';
      el.style.cssText = `
        position: absolute;
        left: ${rect.x + scrollLeft}px;
        top: ${rect.y + scrollTop}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        background: rgba(66, 133, 244, 0.3);
        pointer-events: none;
        z-index: ${Z_INDEX.selectionOverlay};
      `;
      container.appendChild(el);
    }
  }

  onBeforeUnmount(() => {
    clearOverlay();
  });

  return {
    clearOverlay,
    updateSelectionOverlay,
  };
}
