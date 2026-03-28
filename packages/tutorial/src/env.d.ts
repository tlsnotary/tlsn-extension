/// <reference types="vite/client" />

declare const __GIT_HASH__: string;

interface Navigator {
  brave?: {
    isBrave: () => Promise<boolean>;
  };
}
