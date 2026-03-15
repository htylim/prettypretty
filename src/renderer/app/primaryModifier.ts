type PrimaryModifierEvent = {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
};

const getPlatform = (): string => {
  if (typeof navigator === 'undefined') {
    return '';
  }

  const { userAgentData } = navigator as Navigator & {
    userAgentData?: {
      platform?: string;
    };
  };

  return userAgentData?.platform ?? navigator.platform ?? '';
};

export const isMacPlatform = (): boolean => {
  return /mac|iphone|ipad|ipod/iu.test(getPlatform());
};

export const hasPrimaryModifier = (event: PrimaryModifierEvent): boolean => {
  if (event.altKey) {
    return false;
  }

  if (isMacPlatform()) {
    return event.metaKey && !event.ctrlKey;
  }

  return event.ctrlKey && !event.metaKey;
};
