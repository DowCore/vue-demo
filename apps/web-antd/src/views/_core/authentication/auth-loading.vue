<script lang="ts" setup>
defineOptions({ name: 'AuthLoading' });

withDefaults(
  defineProps<{
    /** 主文案 */
    title?: string;
    /** 补充说明 */
    description?: string;
  }>(),
  {
    title: '正在登录',
    description: '',
  },
);
</script>

<template>
  <div class="auth-loading flex flex-col items-center justify-center py-10">
    <span
      class="auth-loading__dot relative inline-block size-10"
      aria-hidden="true"
    >
      <i
        v-for="index in 4"
        :key="index"
        class="bg-primary absolute block size-4 origin-[50%_50%] scale-75 rounded-full opacity-30"
      ></i>
    </span>

    <p class="auth-loading__title text-foreground mt-6 text-base font-medium">
      {{ title }}
      <span class="auth-loading__ellipsis" aria-hidden="true"></span>
    </p>
    <p
      v-if="description"
      class="text-muted-foreground mt-2 max-w-xs text-center text-sm leading-relaxed"
    >
      {{ description }}
    </p>
  </div>
</template>

<style scoped>
.auth-loading {
  animation: auth-loading-fade 0.45s ease-out both;
}

.auth-loading__dot {
  transform: rotate(45deg);
  animation: auth-loading-rotate 1.2s infinite linear;
}

.auth-loading__dot i {
  animation: auth-loading-pulse 1s infinite linear alternate;
}

.auth-loading__dot i:nth-child(1) {
  top: 0;
  left: 0;
}

.auth-loading__dot i:nth-child(2) {
  top: 0;
  right: 0;
  animation-delay: 0.4s;
}

.auth-loading__dot i:nth-child(3) {
  right: 0;
  bottom: 0;
  animation-delay: 0.8s;
}

.auth-loading__dot i:nth-child(4) {
  bottom: 0;
  left: 0;
  animation-delay: 1.2s;
}

.auth-loading__title {
  animation: auth-loading-breathe 1.8s ease-in-out infinite;
}

.auth-loading__ellipsis::after {
  content: '';
  animation: auth-loading-dots 1.4s steps(4, end) infinite;
}

@keyframes auth-loading-fade {
  from {
    opacity: 0;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes auth-loading-rotate {
  to {
    transform: rotate(405deg);
  }
}

@keyframes auth-loading-pulse {
  to {
    opacity: 1;
  }
}

@keyframes auth-loading-breathe {
  0%,
  100% {
    opacity: 0.72;
  }

  50% {
    opacity: 1;
  }
}

@keyframes auth-loading-dots {
  0% {
    content: '';
  }

  25% {
    content: '.';
  }

  50% {
    content: '..';
  }

  75%,
  100% {
    content: '...';
  }
}
</style>
