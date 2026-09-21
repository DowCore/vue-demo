import type { VNode } from 'vue';
import type {
  RouteLocationNormalizedLoaded,
  RouteLocationNormalizedLoadedGeneric,
} from 'vue-router';

import { computed, defineComponent, h, onErrorCaptured, ref } from 'vue';

import { preferences, usePreferences } from '@vben/preferences';

/**
 * 转换组件，自动添加 name
 * @param component
 * @param route
 */
export function transformComponent(
  component: VNode,
  route: RouteLocationNormalizedLoadedGeneric,
) {
  // 组件视图未找到，如果有设置后备视图，则返回后备视图，如果没有，则抛出错误
  if (!component) {
    console.error(
      'Component view not found，please check the route configuration',
    );
    return undefined;
  }

  const routeName = route.name as string;
  // 如果组件没有 name，则直接返回
  if (!routeName) {
    return component;
  }
  const componentName = (component?.type as any)?.name;

  // 已经设置过 name，则直接返回
  if (componentName) {
    return component;
  }

  // componentName 与 routeName 一致，则直接返回
  if (componentName === routeName) {
    return component;
  }

  // 设置 name
  component.type ||= {};
  (component.type as any).name = routeName;

  return component;
}

const routeErrorWrappers = new Map<
  string,
  ReturnType<typeof defineComponent>
>();

function withRouteErrorBoundary(component: VNode, name: string): VNode {
  let Wrapper = routeErrorWrappers.get(name);
  if (!Wrapper) {
    Wrapper = defineComponent({
      name,
      setup(_, { slots }) {
        const error = ref<unknown>(null);
        onErrorCaptured((err) => {
          error.value = err;
          console.error(`[RouteError] ${name}`, err);
          return false;
        });
        return () => {
          if (error.value) {
            const msg =
              error.value instanceof Error
                ? error.value.stack || error.value.message
                : String(error.value);
            return h(
              'div',
              { class: 'flex h-full flex-col items-start gap-3 p-6' },
              [
                h(
                  'div',
                  { class: 'text-base font-medium text-red-500' },
                  '当前页渲染失败，其它标签页仍可切换',
                ),
                h(
                  'pre',
                  {
                    class:
                      'max-h-64 w-full overflow-auto rounded-md bg-muted p-3 font-mono text-xs',
                  },
                  msg,
                ),
                h(
                  'button',
                  {
                    class:
                      'rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent',
                    onClick: () => {
                      error.value = null;
                    },
                  },
                  '重试',
                ),
              ],
            );
          }
          return slots.default?.();
        };
      },
    });
    routeErrorWrappers.set(name, Wrapper);
  }

  return h(Wrapper, null, { default: () => component });
}

/**
 * KeepAlive 用的页面 vnode：补 name，并用错误边界包一层，避免单页渲染异常拆掉整个布局。
 */
export function wrapRouteView(
  component: undefined | VNode,
  route: RouteLocationNormalizedLoadedGeneric,
) {
  if (!component) {
    return undefined;
  }
  const transformed = transformComponent(component, route);
  if (!transformed) {
    return undefined;
  }
  const name =
    ((transformed.type as undefined | { name?: string })?.name as string) ||
    String(route.name || 'RouteView');
  return withRouteErrorBoundary(transformed, name);
}

/**
 * Layout相关hook
 */
export function useLayoutHook() {
  const { keepAlive } = usePreferences();
  /**
   * 是否使用动画
   */
  const getEnabledTransition = computed(() => {
    const { transition } = preferences;
    const transitionName = transition.name;
    return transitionName && transition.enable;
  });

  /**
   * 获取路由过渡动画
   * @param _route
   */
  function getTransitionName(_route: RouteLocationNormalizedLoaded) {
    // 如果偏好设置未设置，则不使用动画
    const { tabbar, transition } = preferences;
    const transitionName = transition.name;
    if (!transitionName || !transition.enable) {
      return;
    }

    // 标签页未启用或者未开启缓存，则使用全局配置动画
    if (!tabbar.enable || !keepAlive) {
      return transitionName;
    }

    // 如果页面已经加载过，则不使用动画
    // if (route.meta.loaded) {
    //   return;
    // }
    // 已经打开且已经加载过的页面不使用动画
    // const inTabs = getCachedTabs.value.includes(route.name as string);

    // return inTabs && route.meta.loaded ? undefined : transitionName;
    return transitionName;
  }

  return {
    getEnabledTransition,
    getTransitionName,
  };
}
