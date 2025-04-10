import { Transition, createStaticVNode, h } from 'vue'
import type { RendererNode, VNode } from 'vue'
// eslint-disable-next-line
import { isString, isPromise, isArray, isObject } from '@vue/shared'
import type { RouteLocationNormalized } from 'vue-router'
// @ts-expect-error virtual file
import { START_LOCATION } from '#build/pages'

/**
 * Internal utility
 * @private
 */
export const _wrapInTransition = (props: any, children: any) => {
  return { default: () => import.meta.client && props ? h(Transition, props === true ? {} : props, children) : children.default?.() }
}

const ROUTE_KEY_PARENTHESES_RE = /(:\w+)\([^)]+\)/g
const ROUTE_KEY_SYMBOLS_RE = /(:\w+)[?+*]/g
const ROUTE_KEY_NORMAL_RE = /:\w+/g
// TODO: consider refactoring into single utility
// See https://github.com/nuxt/nuxt/tree/main/packages/nuxt/src/pages/runtime/utils.ts#L8-L19
function generateRouteKey (route: RouteLocationNormalized) {
  const source = route?.meta.key ?? route.path
    .replace(ROUTE_KEY_PARENTHESES_RE, '$1')
    .replace(ROUTE_KEY_SYMBOLS_RE, '$1')
    .replace(ROUTE_KEY_NORMAL_RE, r => route.params[r.slice(1)]?.toString() || '')
  return typeof source === 'function' ? source(route) : source
}

/**
 * Utility used within router guards
 * return true if the route has been changed with a page change during navigation
 */
export function isChangingPage (to: RouteLocationNormalized, from: RouteLocationNormalized) {
  if (to === from || from === START_LOCATION) { return false }

  // If route keys are different then it will result in a rerender
  if (generateRouteKey(to) !== generateRouteKey(from)) { return true }

  const areComponentsSame = to.matched.every((comp, index) =>
    comp.components && comp.components.default === from.matched[index]?.components?.default,
  )
  if (areComponentsSame) {
    return false
  }
  return true
}

export type SSRBuffer = SSRBufferItem[] & { hasAsync?: boolean }
export type SSRBufferItem = string | SSRBuffer | Promise<SSRBuffer>

/**
 * create buffer retrieved from @vue/server-renderer
 * @see https://github.com/vuejs/core/blob/9617dd4b2abc07a5dc40de6e5b759e851b4d0da1/packages/server-renderer/src/render.ts#L57
 * @private
 */
export function createBuffer () {
  let appendable = false
  const buffer: SSRBuffer = []
  return {
    getBuffer (): SSRBuffer {
      return buffer
    },
    push (item: SSRBufferItem) {
      const isStringItem = isString(item)
      if (appendable && isStringItem) {
        buffer[buffer.length - 1] += item as string
      } else {
        buffer.push(item)
      }
      appendable = isStringItem
      if (isPromise(item) || (isArray(item) && item.hasAsync)) {
        buffer.hasAsync = true
      }
    },
  }
}

/**
 * helper for NuxtIsland to generate a correct array for scoped data
 */
export function vforToArray (source: any): any[] {
  if (isArray(source)) {
    return source
  } else if (isString(source)) {
    return source.split('')
  } else if (typeof source === 'number') {
    if (import.meta.dev && !Number.isInteger(source)) {
      console.warn(`The v-for range expect an integer value but got ${source}.`)
    }
    const array: number[] = []
    for (let i = 0; i < source; i++) {
      array[i] = i
    }
    return array
  } else if (isObject(source)) {
    if (source[Symbol.iterator as any]) {
      return Array.from(source as Iterable<any>, item =>
        item,
      )
    } else {
      const keys = Object.keys(source)
      const array = new Array(keys.length)
      for (let i = 0, l = keys.length; i < l; i++) {
        const key = keys[i]!
        array[i] = source[key]
      }
      return array
    }
  }
  return []
}

/**
 * Retrieve the HTML content from an element
 * Handles `<!--[-->` Fragment elements
 * @param element the element to retrieve the HTML
 * @param withoutSlots purge all slots from the HTML string retrieved
 * @returns {string[]|undefined} An array of string which represent the content of each element. Use `.join('')` to retrieve a component vnode.el HTML
 */
export function getFragmentHTML (element: RendererNode | null, withoutSlots = false): string[] | undefined {
  if (element) {
    if (element.nodeName === '#comment' && element.nodeValue === '[') {
      return getFragmentChildren(element, [], withoutSlots)
    }
    if (withoutSlots) {
      const clone = element.cloneNode(true)
      clone.querySelectorAll('[data-island-slot]').forEach((n: Element) => { n.innerHTML = '' })
      return [clone.outerHTML]
    }
    return [element.outerHTML]
  }
}

function getFragmentChildren (element: RendererNode | null, blocks: string[] = [], withoutSlots = false) {
  if (element && element.nodeName) {
    if (isEndFragment(element)) {
      return blocks
    } else if (!isStartFragment(element)) {
      const clone = element.cloneNode(true) as Element
      if (withoutSlots) {
        clone.querySelectorAll?.('[data-island-slot]').forEach((n) => { n.innerHTML = '' })
      }
      blocks.push(clone.outerHTML)
    }

    getFragmentChildren(element.nextSibling, blocks, withoutSlots)
  }
  return blocks
}

/**
 * Return a static vnode from an element
 * Default to a div if the element is not found and if a fallback is not provided
 * @param el renderer node retrieved from the component internal instance
 * @param staticNodeFallback fallback string to use if the element is not found. Must be a valid HTML string
 */
export function elToStaticVNode (el: RendererNode | null, staticNodeFallback?: string): VNode {
  const fragment: string[] | undefined = el ? getFragmentHTML(el) : staticNodeFallback ? [staticNodeFallback] : undefined
  if (fragment) {
    return createStaticVNode(fragment.join(''), fragment.length)
  }
  return h('div')
}

export function isStartFragment (element: RendererNode) {
  return element.nodeName === '#comment' && element.nodeValue === '['
}

export function isEndFragment (element: RendererNode) {
  return element.nodeName === '#comment' && element.nodeValue === ']'
}
